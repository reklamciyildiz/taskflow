const assert = require("node:assert/strict");
const { NextRequest } = require("next/server");
const { createHash } = require("node:crypto");
const sharp = require("sharp");
const install = (name: string, exports: unknown) => {
  const filename = require.resolve(name);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  } as NodeModule;
};
const Module = require("node:module");
const original = Module._load;
Module._load = function (name: string, ...args: unknown[]) {
  return name === "server-only" ? {} : original.call(this, name, ...args);
};
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let signedIn = true,
  visible = true;
let membership: any = { role: "member" };
let actor: any = { id: id(1), organization_id: id(2), role: "member" };
let file: any = {
  id: id(7),
  task_id: id(4),
  organization_id: id(2),
  team_id: id(3),
  status: "ready",
  uploaded_by: id(1),
};
const rows: any = {
  attachments: [file],
  notes: [],
  attachment_links: [{ id: id(9), attachment_id: id(7) }],
};
let writes = 0;
let finalizeBeforeCancel = false;
let lastAttachmentInsert: any;
const fakeDb = {
  from: (table: string) => {
    let data = [...(rows[table] ?? [])];
    let single = false;
    let patch: any;
    const q: any = {
      select: () => q,
      eq: (key: string, value: any) => {
        data = data.filter((r) => r[key] === value);
        return q;
      },
      limit: () => q,
      in: (key: string, values: any[]) => {
        data = data.filter((r) => values.includes(r[key]));
        return q;
      },
      maybeSingle: () => {
        single = true;
        return q;
      },
      insert: (value: any) => {
        writes++;
        if (table === "attachments") lastAttachmentInsert = value;
        return q;
      },
      update: (value: any) => {
        if (finalizeBeforeCancel && value.status === "deleting")
          file.status = "ready";
        writes++;
        patch = value;
        return q;
      },
      then: (resolve: any, reject: any) => {
        if (patch) data.forEach((row) => Object.assign(row, patch));
        return Promise.resolve({
          data: single ? (data[0] ?? null) : data,
          error: null,
        }).then(resolve, reject);
      },
    };
    return q;
  },
};
install("../lib/auth", { authOptions: {} });
install("next-auth", {
  getServerSession: async () =>
    signedIn ? { user: { email: "test@example.test" } } : null,
});
install("../lib/supabase-admin", { supabaseAdmin: fakeDb });
install("../lib/db", {
  userDb: { getByEmail: async () => actor },
  teamMemberDb: { getMembership: async () => membership },
  taskDb: {
    getById: async () => ({
      id: id(4),
      organization_id: id(2),
      team_id: id(3),
      project_id: id(5),
      checklist_blocks: {
        type: "doc",
        content: [{ type: "taskItem", attrs: { id: "stable" } }],
      },
    }),
  },
  projectDb: {
    getVisibleForUser: async () => (visible ? [{ id: id(5) }] : []),
  },
});
const storageModule = require("../lib/attachment-storage-server");
let storageOverride: ((...args: any[]) => any) | null = null;
install("../lib/attachment-storage-server", {
  ...storageModule,
  storageRequest: (...args: any[]) =>
    storageOverride
      ? storageOverride(...args)
      : storageModule.storageRequest(...args),
});
const {
  attachmentTargetAccess,
  attachmentAccess,
  processAttachmentBytes,
  validatePdfStructure,
  beginAttachment,
  finalizeAttachment,
  requireAttachmentOrigin,
} = require("../lib/attachment-server");
const {
  validateAttachmentInput,
  signatureMatches,
} = require("../lib/attachments");
const { signedObjectUrl } = require("../lib/attachment-storage-server");
let checks = 0;
function validPdf() {
  const header = "%PDF-1.7\n";
  const object = "1 0 obj\n<< /Type /Catalog >>\nendobj\n";
  const xrefOffset = Buffer.byteLength(header + object);
  return Buffer.from(
    `${header}${object}xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    "latin1",
  );
}
async function main() {
  const target = { taskId: id(4) };
  for (const [change, status] of [
    [
      () => {
        signedIn = false;
      },
      401,
    ],
    [
      () => {
        signedIn = true;
        actor.organization_id = id(99);
      },
      403,
    ],
    [
      () => {
        actor.organization_id = id(2);
        membership = null;
      },
      403,
    ],
    [
      () => {
        membership = { role: "viewer" };
      },
      403,
    ],
    [
      () => {
        membership = { role: "member" };
        visible = false;
      },
      404,
    ],
    [
      () => {
        actor.role = "admin";
      },
      404,
    ],
  ] as const) {
    change();
    assert.equal((await attachmentTargetAccess(target, true)).status, status);
    assert.equal(writes, 0);
    checks++;
  }
  visible = true;
  actor.role = "member";
  await assert.rejects(
    attachmentTargetAccess({ ...target, checklistItemId: "foreign" }, true),
  );
  checks++;
  await assert.rejects(
    attachmentTargetAccess({ ...target, noteId: id(99) }, true),
  );
  checks++;
  assert.ok(
    (
      await attachmentTargetAccess(
        { ...target, checklistItemId: "stable" },
        true,
      )
    ).task,
  );
  checks++;
  file.organization_id = id(99);
  await assert.rejects(attachmentAccess(id(7), false));
  file.organization_id = id(2);
  checks++;
  assert.throws(() =>
    validateAttachmentInput("evil.svg", "image/svg+xml", 100),
  );
  assert.throws(() => validateAttachmentInput("evil.html", "image/png", 100));
  assert.throws(() =>
    validateAttachmentInput("huge.png", "image/png", 11 * 1024 * 1024),
  );
  checks += 3;
  assert.equal(signatureMatches(Buffer.from("<html>"), "image/png"), false);
  checks++;
  await assert.rejects(
    processAttachmentBytes(Buffer.from("<html>"), "image/png"),
  );
  checks++;
  for (const format of ["png", "jpeg", "webp"]) {
    const mime = format === "jpeg" ? "image/jpeg" : `image/${format}`;
    const original = await sharp({
      create: {
        width: 512,
        height: 256,
        channels: 4,
        background: {
          r: 31,
          g: 70,
          b: 121,
          alpha: format === "jpeg" ? 1 : 0.5,
        },
      },
    })
      [format]()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await processAttachmentBytes(original, mime);
    assert.ok(result.bytes.length <= original.length);
    assert.ok(result.thumbnail.length);
    assert.equal(result.width, 256);
    assert.equal(result.height, 512);
    const sourcePixels = await sharp(original).rotate().raw().toBuffer();
    const targetPixels = await sharp(result.bytes).rotate().raw().toBuffer();
    assert.deepEqual(targetPixels, sourcePixels, "No pixel/alpha loss");
    const metadata = await sharp(result.bytes).metadata();
    assert.ok(!metadata.xmp);
    checks += 6;
  }
  // Noise favors original compressed JPEG fallback; only orientation metadata may survive.
  const noise = require("node:crypto").randomBytes(128 * 128 * 3);
  const jpeg = await sharp(noise, {
    raw: { width: 128, height: 128, channels: 3 },
  })
    .jpeg({ quality: 70 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const fallback = await processAttachmentBytes(jpeg, "image/jpeg");
  assert.equal(fallback.mime, "image/jpeg");
  assert.ok(fallback.bytes.length <= jpeg.length);
  assert.deepEqual(
    await sharp(jpeg).rotate().raw().toBuffer(),
    await sharp(fallback.bytes).rotate().raw().toBuffer(),
  );
  checks += 3;
  const pdf = validPdf();
  validatePdfStructure(pdf);
  assert.throws(() => validatePdfStructure(Buffer.from("%PDF-1.7\nbroken")));
  assert.throws(() =>
    validatePdfStructure(
      Buffer.from(
        pdf.toString("latin1").replace("/Root", "/Encrypt 2 0 R /Root"),
        "latin1",
      ),
    ),
  );
  checks += 3;
  delete process.env.ATTACHMENT_SCANNER_URL;
  delete process.env.ATTACHMENT_SCANNER_TOKEN;
  delete process.env.ATTACHMENT_PDF_SECURITY_MODE;
  delete process.env.ATTACHMENT_PDF_BETA_USER_IDS;
  await assert.rejects(processAttachmentBytes(pdf, "application/pdf"));
  checks++;
  process.env.ATTACHMENT_PDF_SECURITY_MODE = "trusted_beta";
  process.env.ATTACHMENT_PDF_BETA_USER_IDS = id(1);
  assert.deepEqual(
    (
      await processAttachmentBytes(pdf, "application/pdf", {
        trustedBeta: true,
      })
    ).bytes,
    pdf,
  );
  checks++;
  process.env.R2_ACCOUNT_ID = "fixture";
  process.env.R2_ACCESS_KEY_ID = "fixture";
  process.env.R2_SECRET_ACCESS_KEY = "fixture";
  process.env.R2_BUCKET = "fixture";
  await beginAttachment(
    {
      task: { id: id(4), organization_id: id(2), team_id: id(3) },
      user: { id: id(1) },
    },
    { taskId: id(4) },
    { filename: "beta.pdf", mimeType: "application/pdf", size: pdf.length },
  );
  assert.match(lastAttachmentInsert.object_key, /^files\/unscanned-pdf\//);
  process.env.ATTACHMENT_PDF_BETA_USER_IDS = id(99);
  await assert.rejects(
    beginAttachment(
      {
        task: { id: id(4), organization_id: id(2), team_id: id(3) },
        user: { id: id(1) },
      },
      { taskId: id(4) },
      { filename: "denied.pdf", mimeType: "application/pdf", size: pdf.length },
    ),
  );
  checks += 2;
  process.env.ATTACHMENT_SCANNER_URL = "https://scanner.example.test/scan";
  process.env.ATTACHMENT_SCANNER_TOKEN = "test";
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ verdict: "infected" }));
  await assert.rejects(processAttachmentBytes(pdf, "application/pdf"));
  checks++;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        verdict: "clean",
        sha256: createHash("sha256").update(pdf).digest("hex"),
      }),
    );
  assert.deepEqual(
    (await processAttachmentBytes(pdf, "application/pdf")).bytes,
    pdf,
  );
  checks++;
  global.fetch = originalFetch;
  const url = new URL(
    await signedObjectUrl("pending/opaque", "PUT", "image/png", undefined, 100),
  );
  assert.equal(url.searchParams.get("X-Amz-Expires"), "120");
  assert.match(url.searchParams.get("X-Amz-SignedHeaders"), /content-length/);
  assert.match(url.searchParams.get("X-Amz-SignedHeaders"), /content-type/);
  checks += 3;
  const route = require("../app/api/attachments/[id]/route");
  signedIn = false;
  assert.equal(
    (
      await route.GET(
        new NextRequest("http://localhost/api/attachments/test"),
        { params: { id: id(7) } },
      )
    ).status,
    401,
  );
  checks++;
  signedIn = true;
  Object.assign(file, {
    status: "ready",
    filename: "beta.pdf",
    mime_type: "application/pdf",
    size_bytes: pdf.length,
    object_key: `files/unscanned-pdf/${id(2)}/${id(7)}/document`,
    thumbnail_key: null,
    width: null,
    height: null,
  });
  const noPreview = await route.GET(
    new NextRequest(`http://localhost/api/attachments/${file.id}`),
    { params: { id: file.id } },
  );
  assert.equal(noPreview.status, 200);
  assert.equal((await noPreview.json()).url, null);
  const safeDownload = await route.GET(
    new NextRequest(`http://localhost/api/attachments/${file.id}?download=1`),
    { params: { id: file.id } },
  );
  assert.equal(safeDownload.status, 200);
  assert.match((await safeDownload.json()).url, /response-content-disposition/);
  checks += 4;
  assert.throws(() =>
    requireAttachmentOrigin(
      new NextRequest("http://localhost/api/attachments", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  );
  checks++;
  const valid = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#445566" },
  })
    .png()
    .toBuffer();
  Object.assign(file, {
    status: "pending",
    size_bytes: valid.length,
    mime_type: "image/png",
    staging_key: "pending/file",
    object_key: "files/document",
    thumbnail_key: "files/thumbnail",
  });
  let wrongSize = true,
    cancelDuringPut = false;
  const stored = new Map();
  storageOverride = async (key: string, method: string, body: any) => {
    if (method === "HEAD")
      return new Response(null, {
        headers: {
          "content-length": String(valid.length + (wrongSize ? 1 : 0)),
        },
      });
    if (method === "GET") return new Response(valid);
    if (method === "PUT") {
      stored.set(key, body);
      if (cancelDuringPut) file.status = "deleting";
    }
    return new Response(null);
  };
  await assert.rejects(finalizeAttachment({ ...file }));
  assert.equal(file.status, "pending");
  assert.equal(stored.size, 0);
  checks += 3;
  wrongSize = false;
  cancelDuringPut = true;
  await assert.rejects(finalizeAttachment({ ...file }));
  assert.equal(file.status, "deleting");
  checks += 2;
  file.status = "pending";
  cancelDuringPut = false;
  await finalizeAttachment({ ...file });
  assert.equal(file.status, "ready");
  assert.ok(stored.has("files/document"));
  assert.ok(!stored.has("pending/file"));
  checks += 3;
  const writesBefore = writes;
  await finalizeAttachment({ ...file });
  assert.equal(writes, writesBefore);
  checks++;
  signedIn = true;
  file.status = "processing";
  finalizeBeforeCancel = true;
  assert.equal(
    (
      await route.DELETE(
        new NextRequest("http://localhost/api/attachments/test", {
          method: "DELETE",
        }),
        { params: { id: file.id } },
      )
    ).status,
    200,
  );
  assert.equal(
    file.status,
    "ready",
    "Late cancellation cannot retire a finalized attachment",
  );
  checks += 2;
  console.log(
    JSON.stringify({ attachmentChecks: checks, productionAccess: false }),
  );
}
main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
export {};
