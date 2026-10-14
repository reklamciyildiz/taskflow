import "server-only";
import { createHash, randomUUID } from "crypto";
import sharp from "sharp";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabase-admin";
import { requireTaskNoteAccess } from "@/lib/note-server";
import {
  signatureMatches,
  validateAttachmentInput,
  type AttachmentTarget,
} from "@/lib/attachments";
import {
  signedObjectUrl,
  StorageRequestError,
  storageRequest,
} from "@/lib/attachment-storage-server";
import { stripImageMetadata } from "@/lib/image-metadata";

export class AttachmentError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const UNSCANNED_PDF_SEGMENT = "/unscanned-pdf/";
type FinalizeStage =
  | "claim"
  | "r2_head"
  | "r2_download"
  | "validate"
  | "sharp_process"
  | "r2_put_document"
  | "r2_put_thumbnail"
  | "mark_ready"
  | "rollback";

type StageMeasure = <T>(
  stage: FinalizeStage,
  operation: () => PromiseLike<T>,
) => Promise<T>;

function safeDiagnosticToken(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const token = value.slice(0, 64);
  return /^[A-Za-z0-9._:-]+$/.test(token) ? token : fallback;
}

function diagnosticError(error: unknown) {
  const storageError = error instanceof StorageRequestError ? error : null;
  const errorStatus =
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : null;
  const code =
    storageError?.upstreamCode ??
    (error && typeof error === "object" && "code" in error
      ? safeDiagnosticToken(String(error.code), "unknown")
      : null);
  return {
    httpStatus: storageError?.status ?? errorStatus,
    errorName: safeDiagnosticToken(
      error instanceof Error ? error.name : typeof error,
      "UnknownError",
    ),
    errorCode: code,
    upstreamRequestId: storageError?.upstreamRequestId ?? null,
    retryCount: storageError?.retryCount ?? null,
    retryLimit: storageError?.retryLimit ?? null,
  };
}
function scannerConfigured() {
  return Boolean(
    process.env.ATTACHMENT_SCANNER_URL?.startsWith("https://") &&
    process.env.ATTACHMENT_SCANNER_TOKEN,
  );
}
function trustedBetaUser(userId: string) {
  if (process.env.ATTACHMENT_PDF_SECURITY_MODE !== "trusted_beta") return false;
  return (process.env.ATTACHMENT_PDF_BETA_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}
export function isUnscannedBetaPdf(file: {
  mime_type: string;
  object_key: string;
}) {
  return (
    file.mime_type === "application/pdf" &&
    file.object_key.includes(UNSCANNED_PDF_SEGMENT)
  );
}
export function validatePdfStructure(bytes: Buffer): void {
  if (!signatureMatches(bytes, "application/pdf"))
    throw new AttachmentError(
      "File contents do not match the declared PDF format.",
    );
  const text = bytes.toString("latin1");
  const eof = text.lastIndexOf("%%EOF");
  if (eof < Math.max(0, text.length - 2048))
    throw new AttachmentError("The PDF is incomplete or malformed.");
  if (/\/Encrypt\b/.test(text))
    throw new AttachmentError(
      "Encrypted or password-protected PDFs are not supported.",
    );
  if (!/\d+\s+\d+\s+obj\b/.test(text) || !/\bendobj\b/.test(text))
    throw new AttachmentError(
      "The PDF object structure could not be verified.",
    );
  const tail = text.slice(Math.max(0, eof - 256));
  const start = /startxref\s+(\d+)\s+%%EOF[\s\0]*$/.exec(tail);
  if (!start)
    throw new AttachmentError("The PDF cross-reference table is missing.");
  const offset = Number(start[1]);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= bytes.length)
    throw new AttachmentError("The PDF cross-reference offset is invalid.");
  const target = text.slice(offset, Math.min(text.length, offset + 512));
  if (
    !/^xref\b/.test(target) &&
    !/^\d+\s+\d+\s+obj\b[\s\S]*\/Type\s*\/XRef\b/.test(target)
  )
    throw new AttachmentError(
      "The PDF cross-reference structure could not be verified.",
    );
}
export function requireAttachmentOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.NEXTAUTH_URL || request.url).origin;
  if (origin && origin !== expected)
    throw new AttachmentError("Forbidden request origin.", 403);
}
function checked<T extends { error: any }>(result: T): T {
  if (result.error)
    throw new AttachmentError(
      "File operation failed. Retry or contact your administrator.",
      409,
    );
  return result;
}
export async function attachmentTargetAccess(
  target: AttachmentTarget,
  mutate: boolean,
) {
  if (!target?.taskId || (target.noteId && target.checklistItemId))
    throw new AttachmentError("Invalid file destination.");
  const access = await requireTaskNoteAccess(target.taskId, { mutate });
  if (access instanceof NextResponse) return access;
  if (target.noteId) {
    const note = checked(
      await db
        .from("notes")
        .select("id")
        .eq("id", target.noteId)
        .eq("task_id", target.taskId)
        .maybeSingle(),
    ).data;
    if (!note) throw new AttachmentError("Note not found.", 404);
  }
  if (target.checklistItemId) {
    const contains = (node: any): boolean =>
      (node?.type === "taskItem" &&
        node.attrs?.id === target.checklistItemId) ||
      (Array.isArray(node?.content) && node.content.some(contains));
    if (!contains(access.task.checklist_blocks))
      throw new AttachmentError(
        "Save the checklist item before attaching files.",
        409,
      );
  }
  return access;
}
export async function attachmentAccess(id: string, mutate: boolean) {
  const file = checked(
    await db.from("attachments").select("*").eq("id", id).maybeSingle(),
  ).data;
  if (!file?.task_id) throw new AttachmentError("File not found.", 404);
  const access = await attachmentTargetAccess({ taskId: file.task_id }, mutate);
  if (access instanceof NextResponse) return access;
  if (
    file.organization_id !== access.task.organization_id ||
    file.team_id !== access.task.team_id
  )
    throw new AttachmentError("File not found.", 404);
  return { ...access, file };
}
export async function beginAttachment(
  access: any,
  target: AttachmentTarget,
  input: any,
) {
  const filename = validateAttachmentInput(
    String(input.filename ?? ""),
    input.mimeType,
    input.size,
  );
  const betaPdf =
    input.mimeType === "application/pdf" &&
    !scannerConfigured() &&
    trustedBetaUser(access.user.id);
  if (input.mimeType === "application/pdf" && !scannerConfigured() && !betaPdf)
    throw new AttachmentError(
      "PDF uploads require security scanning or explicit trusted-beta access.",
      403,
    );
  const id = randomUUID();
  const prefix = `${access.task.organization_id}/${id}`;
  const file = {
    id,
    task_id: target.taskId,
    organization_id: access.task.organization_id,
    team_id: access.task.team_id,
    uploaded_by: access.user.id,
    filename,
    mime_type: input.mimeType,
    size_bytes: input.size,
    staging_key: `pending/${prefix}`,
    object_key: betaPdf
      ? `files/unscanned-pdf/${prefix}/document`
      : `files/${prefix}/document`,
    thumbnail_key: `files/${prefix}/thumbnail`,
  };
  // Database trigger serializes organization quota reservations, including in-flight uploads.
  const inserted = await db.from("attachments").insert(file);
  if (inserted.error) {
    if (/quota|Upload limit/.test(inserted.error.message))
      throw new AttachmentError(inserted.error.message, 429);
    checked(inserted);
  }
  const links: any[] = [{ attachment_id: id, task_id: target.taskId }];
  if (target.noteId || target.checklistItemId)
    links.push({
      attachment_id: id,
      task_id: target.taskId,
      note_id: target.noteId,
      checklist_item_id: target.checklistItemId,
    });
  checked(await db.from("attachment_links").insert(links));
  return {
    id,
    uploadUrl: await signedObjectUrl(
      file.staging_key,
      "PUT",
      file.mime_type,
      undefined,
      file.size_bytes,
    ),
    expiresIn: 120,
  };
}

async function boundedObject(
  key: string,
  expectedSize: number,
  measure: StageMeasure,
) {
  const head = await measure("r2_head", () => storageRequest(key, "HEAD"));
  if (Number(head.headers.get("content-length")) !== expectedSize)
    throw new AttachmentError("Uploaded file size does not match.");
  return measure("r2_download", async () => {
    const response = await storageRequest(key, "GET");
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > expectedSize)
          throw new AttachmentError("Uploaded file is too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    if (total !== expectedSize) throw new AttachmentError("Incomplete upload.");
    return Buffer.concat(chunks);
  });
}
export async function processAttachmentBytes(
  bytes: Buffer,
  mime: string,
  options: { trustedBeta?: boolean; measure?: StageMeasure } = {},
) {
  const measure: StageMeasure =
    options.measure ?? (async (_stage, operation) => operation());
  await measure("validate", async () => {
    if (!signatureMatches(bytes, mime))
      throw new AttachmentError(
        "File contents do not match the declared format.",
      );
    if (mime === "application/pdf") validatePdfStructure(bytes);
  });
  if (mime === "application/pdf") {
    const scanner = process.env.ATTACHMENT_SCANNER_URL;
    if (!scannerConfigured()) {
      if (options.trustedBeta)
        return { bytes, mime, thumbnail: null, width: null, height: null };
      throw new AttachmentError(
        "Document security scanning is unavailable.",
        503,
      );
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const result = await measure("validate", () =>
      fetch(scanner!, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": mime,
          Authorization: `Bearer ${process.env.ATTACHMENT_SCANNER_TOKEN}`,
        },
        body: bytes,
        signal: AbortSignal.timeout(25000),
      }),
    );
    const scan = result.ok ? await result.json() : null;
    if (scan?.verdict !== "clean" || scan?.sha256 !== checksum)
      throw new AttachmentError(
        "Document security scan did not approve this PDF.",
      );
    return { bytes, mime, thumbnail: null, width: null, height: null };
  }
  return measure("sharp_process", async () => {
    const image = sharp(bytes, {
      limitInputPixels: 24_000_000,
      failOn: "error",
      animated: true,
    });
    const meta = await image.metadata();
    if ((meta.pages ?? 1) > 1)
      throw new AttachmentError("Animated images are not supported.");
    // Re-encode without EXIF/XMP. No downscaling of the document; lossless WebP
    // preserves screenshot/diagram text and alpha. Use native sanitized encoding if smaller.
    const rotated = image.rotate();
    // Lossless fallback preserves original compressed pixels, dropping EXIF/XMP/IPTC.
    const native = stripImageMetadata(bytes, mime, meta.orientation);
    const webp = await rotated
      .clone()
      .webp({ lossless: true, effort: 3 })
      .toBuffer();
    const useWebp = webp.length < native.length;
    const thumbnail = await rotated
      .clone()
      .resize({
        width: 384,
        height: 384,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
    const rotatedDimensions = (meta.orientation ?? 1) >= 5;
    return {
      bytes: useWebp ? webp : native,
      mime: useWebp ? "image/webp" : mime,
      thumbnail,
      width: rotatedDimensions ? meta.height! : meta.width!,
      height: rotatedDimensions ? meta.width! : meta.height!,
    };
  });
}
export async function finalizeAttachment(file: any) {
  if (file.status === "ready") return { id: file.id };
  if (file.status !== "pending")
    throw new AttachmentError(
      "Upload is processing or no longer available.",
      409,
    );
  const operationId = randomUUID();
  const finalizeStarted = Date.now();
  const stages: Partial<Record<FinalizeStage, number>> = {};
  let currentStage: FinalizeStage = "claim";
  let claimed = false;
  const measure: StageMeasure = async (stage, operation) => {
    currentStage = stage;
    const started = Date.now();
    try {
      return await operation();
    } finally {
      stages[stage] = (stages[stage] ?? 0) + Date.now() - started;
    }
  };
  try {
    const claim = checked(
      await measure("claim", () =>
        db
          .from("attachments")
          .update({
            status: "processing",
            updated_at: new Date().toISOString(),
          })
          .eq("id", file.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle(),
      ),
    ).data;
    if (!claim) throw new AttachmentError("Upload is already processing.", 409);
    claimed = true;
    const bytes = await boundedObject(
      file.staging_key,
      Number(file.size_bytes),
      measure,
    );
    const betaPdf = isUnscannedBetaPdf(file);
    if (betaPdf && !scannerConfigured() && !trustedBetaUser(file.uploaded_by))
      throw new AttachmentError(
        "Trusted-beta PDF access is no longer enabled.",
        403,
      );
    const processed = await processAttachmentBytes(bytes, file.mime_type, {
      trustedBeta: betaPdf,
      measure,
    });
    // Keys exposed by PUT are never served. Validated content has a separate immutable key.
    await measure("r2_put_document", () =>
      storageRequest(file.object_key, "PUT", processed.bytes, processed.mime),
    );
    if (processed.thumbnail)
      await measure("r2_put_thumbnail", () =>
        storageRequest(
          file.thumbnail_key,
          "PUT",
          processed.thumbnail,
          "image/webp",
        ),
      );
    const ready = checked(
      await measure("mark_ready", () =>
        db
          .from("attachments")
          .update({
            status: "ready",
            mime_type: processed.mime,
            stored_bytes:
              processed.bytes.length + (processed.thumbnail?.length ?? 0),
            width: processed.width,
            height: processed.height,
            thumbnail_key: processed.thumbnail ? file.thumbnail_key : null,
            checksum: createHash("sha256")
              .update(processed.bytes)
              .digest("hex"),
            updated_at: new Date().toISOString(),
          })
          .eq("id", file.id)
          .eq("status", "processing")
          .eq("task_id", file.task_id)
          .select("id")
          .maybeSingle(),
      ),
    ).data;
    if (!ready)
      throw new AttachmentError(
        "Upload destination is no longer available.",
        409,
      );
    // Pending prefix also has a bucket lifecycle rule: a still-live PUT may recreate it.
    await storageRequest(file.staging_key, "DELETE").catch(() => undefined);
    console.info(
      JSON.stringify({
        event: "attachment_finalize",
        outcome: "success",
        operationId,
        mimeType: safeDiagnosticToken(file.mime_type, "unknown"),
        declaredBytes: Number(file.size_bytes),
        processedBytes:
          processed.bytes.length + (processed.thumbnail?.length ?? 0),
        stages,
        totalDurationMs: Date.now() - finalizeStarted,
        region: safeDiagnosticToken(process.env.VERCEL_REGION, "unknown"),
      }),
    );
    return { id: file.id };
  } catch (error) {
    const failedStage = currentStage;
    let rollback: Record<string, unknown> = {
      outcome: claimed ? "not_attempted" : "not_required",
    };
    if (claimed) {
      try {
        const result = await measure("rollback", () =>
          db
            .from("attachments")
            .update({ status: "pending", updated_at: new Date().toISOString() })
            .eq("id", file.id)
            .eq("status", "processing"),
        );
        rollback = result.error
          ? {
              outcome: "failure",
              errorName: "DatabaseError",
              errorCode: safeDiagnosticToken(result.error.code, "unknown"),
            }
          : { outcome: "success" };
      } catch (rollbackError) {
        rollback = { outcome: "failure", ...diagnosticError(rollbackError) };
      }
    }
    console.error(
      JSON.stringify({
        event: "attachment_finalize",
        outcome: "failure",
        operationId,
        stage: failedStage,
        durationMs: stages[failedStage] ?? null,
        totalDurationMs: Date.now() - finalizeStarted,
        mimeType: safeDiagnosticToken(file.mime_type, "unknown"),
        declaredBytes: Number(file.size_bytes),
        stages,
        ...diagnosticError(error),
        rollback,
        region: safeDiagnosticToken(process.env.VERCEL_REGION, "unknown"),
      }),
    );
    throw error;
  }
}
export async function cleanupAttachments() {
  const files = checked(await db.rpc("claim_attachment_cleanup")).data ?? [];
  let deleted = 0;
  for (const file of files) {
    try {
      for (const key of [
        file.staging_key,
        file.object_key,
        file.thumbnail_key,
      ].filter(Boolean))
        await storageRequest(key, "DELETE");
      checked(
        await db
          .from("attachments")
          .delete()
          .eq("id", file.id)
          .eq("status", "deleting"),
      );
      deleted++;
    } catch {
      /* Lease expires; next cleanup retries all deterministic keys. */
    }
  }
  return { claimed: files.length, deleted };
}
export function attachmentFailure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof AttachmentError ||
        (error instanceof Error && /Choose a|must be under/.test(error.message))
          ? (error as Error).message
          : "File operation failed. Please retry.",
    },
    {
      status: error instanceof AttachmentError ? error.status : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
