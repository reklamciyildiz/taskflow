// Real React provider, file picker, XHR, TipTap and NodeViews; local fake API/R2.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const esbuild = require("esbuild"),
  postcss = require("postcss"),
  tailwind = require("tailwindcss"),
  sharp = require("sharp");
async function main() {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "axiom-attachments-"));
  await esbuild.build({
    entryPoints: ["scripts/fixtures/attachments.tsx"],
    outfile: path.join(output, "app.js"),
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const css = await postcss([tailwind("./tailwind.config.ts")]).process(
    fs.readFileSync("app/globals.css", "utf8"),
    { from: "app/globals.css" },
  );
  fs.writeFileSync(path.join(output, "app.css"), css.css);
  const png = await sharp({
    create: { width: 120, height: 80, channels: 4, background: "#4488aa" },
  })
    .png()
    .toBuffer();
  let next = 0,
    failPut = false,
    slow = false;
  const rows = new Map();
  let server;
  const json = (res, data, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (url.pathname === "/app.js" || url.pathname === "/app.css") {
      res.setHeader(
        "Content-Type",
        url.pathname.endsWith(".css") ? "text/css" : "text/javascript",
      );
      res.end(fs.readFileSync(path.join(output, url.pathname.slice(1))));
      return;
    }
    if (url.pathname === "/image") {
      res.setHeader("Content-Type", "image/png");
      res.end(png);
      return;
    }
    if (url.pathname === "/expired") {
      json(res, { error: "Expired" }, 403);
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if (url.pathname === "/api/attachments" && req.method === "GET") {
      json(res, {
        enabled: true,
        pdfUploadsEnabled: true,
        hasMore: false,
        files: [...rows.values()].filter(
          (row) => row.taskId === url.searchParams.get("taskId") && row.ready,
        ),
      });
      return;
    }
    if (url.pathname === "/api/attachments" && req.method === "POST") {
      const body = JSON.parse(bytes);
      const id = `file-${++next}`;
      rows.set(id, {
        id,
        filename: body.filename,
        mime_type: body.mimeType,
        size_bytes: body.size,
        preview_allowed: body.mimeType !== "application/pdf",
        taskId: body.target.taskId,
        ready: false,
        links: [
          { id: `root-${id}`, note_id: null, checklist_item_id: null },
          ...(body.target.checklistItemId
            ? [
                {
                  id: `check-${id}`,
                  note_id: null,
                  checklist_item_id: body.target.checklistItemId,
                },
              ]
            : []),
        ],
      });
      json(res, { id, uploadUrl: `${origin}/put/${id}` });
      return;
    }
    if (url.pathname.startsWith("/put/")) {
      if (slow) await new Promise((r) => setTimeout(r, 3000));
      if (failPut) {
        failPut = false;
        json(res, {}, 500);
      } else json(res, {});
      return;
    }
    if (url.pathname.startsWith("/api/attachments/")) {
      const row = rows.get(url.pathname.split("/").pop());
      if (!row) {
        json(res, { error: "Missing file" }, 404);
        return;
      }
      if (req.method === "POST") {
        row.ready = true;
        json(res, { id: row.id });
        return;
      }
      if (req.method === "GET") {
        if (url.searchParams.get("download") === "1")
          row.downloadRequests = (row.downloadRequests ?? 0) + 1;
        row.urlRequests = (row.urlRequests ?? 0) + 1;
        json(res, {
          url: `${origin}/${row.filename === "expiry.png" && row.urlRequests === 1 ? "expired" : "image"}`,
          file: row,
        });
        return;
      }
      if (req.method === "DELETE") {
        if (!row.ready) rows.delete(row.id);
        else
          row.links = row.links.filter(
            (link) => link.id !== url.searchParams.get("linkId"),
          );
        json(res, { success: true });
        return;
      }
      if (req.method === "PATCH") {
        row.filename = JSON.parse(bytes).filename;
        json(res, { success: true });
        return;
      }
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { chromium } = require(path.resolve(process.argv[2]));
  const browser = await chromium.launch({
    executablePath: process.argv[3],
    headless: true,
  });
  let checks = 0;
  const errors = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 375, height: 900 },
    });
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole("button", { name: "Files", exact: true }).click();
    // Without scanner configuration, the PDF picker stays available but the
    // user sees the explicit download-only warning before uploading.
    await page.getByText(/not malware-scanned; download-only/).waitFor();
    const file = { name: "diagram.png", mimeType: "image/png", buffer: png };
    await page.getByLabel("Choose attachments").setInputFiles(file);
    await page
      .getByRole("button", { name: "Preview diagram.png", exact: true })
      .waitFor();
    checks++;
    await page
      .getByLabel("Insert image or PDF")
      .setInputFiles({ ...file, name: "note-image.png" });
    await page.waitForFunction(() =>
      window.qa.saved?.content.some((node) => node.type === "attachment"),
    );
    const saved = await page.evaluate(() => window.qa.saved);
    assert.ok(!JSON.stringify(saved).includes("http"));
    assert.ok(!JSON.stringify(saved).includes("base64"));
    checks += 2;
    await page.evaluate(() => {
      const editor = document.querySelector(
        '[data-test="note"] .tiptap',
      ).editor;
      editor.commands.undo();
    });
    assert.equal(
      await page.locator('[data-test="note"] [data-attachment-id]').count(),
      0,
    );
    checks++;
    await page.evaluate(() =>
      document
        .querySelector('[data-test="note"] .tiptap')
        .editor.commands.redo(),
    );
    assert.equal(
      await page.locator('[data-test="note"] [data-attachment-id]').count(),
      1,
    );
    checks++;
    await page.evaluate(
      (doc) =>
        document
          .querySelector('[data-test="note"] .tiptap')
          .editor.commands.setContent(doc),
      saved,
    );
    assert.deepEqual(
      await page.evaluate(() =>
        document.querySelector('[data-test="note"] .tiptap').editor.getJSON(),
      ),
      saved,
    );
    checks++;
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], "paste.png", { type: "image/png" }));
      const editor = document.querySelector('[data-test="note"] .tiptap');
      editor.editor.commands.focus("end");
      editor.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    }, png.toString("base64"));
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-test="note"] [data-attachment-id]')
          .length === 2,
    );
    checks++;
    // Contextual checklist file selection.
    await page
      .locator('[data-task-id="stable-item"]')
      .getByRole("button", { name: "Checklist item actions", exact: true })
      .last()
      .click();
    await page.getByRole("menuitem", { name: "Files", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Choose attachments")
      .setInputFiles({ ...file, name: "checklist.png" });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Preview checklist.png", exact: true })
      .waitFor();
    checks++;
    await page.keyboard.press("Escape");
    assert.ok(
      [...rows.values()].some((row) =>
        row.links.some((link) => link.checklist_item_id === "stable-item"),
      ),
      JSON.stringify(
        [...rows.values()].map((r) => ({ name: r.filename, links: r.links })),
      ),
    );
    checks++;
    assert.ok(
      await page
        .getByLabel("1 checklist attachments")
        .evaluate((element) => element.getBoundingClientRect().width > 45),
    );
    checks++;
    // Failed PUT, retry, and cancellation keep editor editable.
    failPut = true;
    await page
      .getByLabel("Insert image or PDF")
      .setInputFiles({ ...file, name: "retry.png" });
    await page.getByRole("button", { name: "Retry upload" }).click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-test="note"] [data-attachment-id]')
          .length === 3,
    );
    checks++;
    slow = false;
    // Native file drop in a nested checklist keeps the stable contextual identity.
    await page.evaluate((base64) => {
      const data = new DataTransfer();
      data.items.add(
        new File(
          [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
          "drop.png",
          { type: "image/png" },
        ),
      );
      document
        .querySelector('[data-task-id="nested-item"] .checklist-item-content')
        .dispatchEvent(
          new DragEvent("drop", {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
          }),
        );
    }, png.toString("base64"));
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[aria-label="1 checklist attachments"]').length ===
        2,
    );
    assert.ok(
      [...rows.values()].some(
        (row) =>
          row.filename === "drop.png" &&
          row.links.some((link) => link.checklist_item_id === "nested-item"),
      ),
    );
    checks++;
    await page
      .getByLabel("Insert image or PDF")
      .setInputFiles({ ...file, name: "expiry.png" });
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-test="note"] [data-attachment-id]')
          .length === 4,
    );
    await page
      .locator('[data-test="note"] [data-attachment-id]')
      .last()
      .scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('[data-test="note"] img')).some(
        (img) => img.alt === "expiry.png" && img.naturalWidth > 0,
      ),
    );
    assert.ok(
      [...rows.values()].find((row) => row.filename === "expiry.png")
        .urlRequests >= 2,
    );
    checks++;
    await page.getByLabel("Insert image or PDF").setInputFiles({
      name: "document.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nfixture"),
    });
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-test="note"] [data-attachment-id]')
          .length === 5,
    );
    checks++;
    await page
      .getByRole("button", { name: "Preview document.pdf", exact: true })
      .first()
      .click();
    await page.getByText("Ready to download").waitFor();
    await page.getByText("Not malware-scanned").waitFor();
    assert.equal(await page.getByRole("dialog").locator("iframe").count(), 0);
    const downloadPagePromise = page.context().waitForEvent("page");
    await page
      .getByRole("button", { name: "Download PDF" })
      .click();
    const downloadPage = await downloadPagePromise;
    await downloadPage.close();
    await page.waitForTimeout(100);
    assert.equal(
      [...rows.values()].find((row) => row.filename === "document.pdf")
        .downloadRequests,
      1,
    );
    checks += 2;
    await page.keyboard.press("Escape");
    const beforeReuse = rows.size;
    await page
      .getByRole("button", { name: "Browse library", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Insert", exact: true })
      .first()
      .click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll('[data-test="note"] [data-attachment-id]')
          .length === 6,
    );
    assert.equal(rows.size, beforeReuse);
    checks++;
    await page.evaluate(() => window.qa.setReadOnly(true));
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-test="note"] .tiptap').editor.isEditable,
    );
    const beforeReadOnly = await page.evaluate(() => window.qa.updates);
    await page
      .locator('[data-test="note"] [data-attachment-id]')
      .first()
      .getByRole("button", { name: /^Enlarge image / })
      .click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByLabel("Insert image or PDF").count(), 0);
    assert.equal(await page.evaluate(() => window.qa.updates), beforeReadOnly);
    checks += 2;
    await page.evaluate(() => window.qa.setReadOnly(false));
    await page.waitForFunction(
      () =>
        document.querySelector('[data-test="note"] .tiptap').editor.isEditable,
    );
    slow = true;
    await page
      .getByLabel("Insert image or PDF")
      .setInputFiles({ ...file, name: "cancel.png" });
    await page.getByRole("button", { name: "Cancel upload" }).click();
    assert.equal(
      await page.locator('[data-test="note"] [data-attachment-id]').count(),
      6,
    );
    checks++;
    for (const theme of ["light", "dark"])
      for (const width of [320, 375, 430, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(
          (theme) =>
            document.documentElement.classList.toggle("dark", theme === "dark"),
          theme,
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${theme} ${width} overflow`,
        );
        checks++;
        await page.screenshot({
          path: path.join(output, `${theme}-${width}.png`),
          fullPage: true,
        });
      }
    await page
      .getByLabel("Insert image or PDF")
      .setInputFiles({ ...file, name: "switch.png" });
    await page
      .getByRole("button", { name: "Switch Action", exact: true })
      .click();
    await page.waitForTimeout(900);
    assert.equal(
      await page.locator('[data-test="note"] [data-attachment-id]').count(),
      0,
    );
    checks++;
    // Actiproc Notes rich editing: Chromium paste, typed code and round-trip.
    await page.setViewportSize({ width: 375, height: 900 });
    await page.evaluate(() => {
      const editor = document.querySelector('[data-test="note"] .tiptap').editor;
      editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
      editor.commands.focus('end');
    });
    await page.getByRole('button', { name: 'Insert code block' }).click();
    await page.locator('.actiproc-codeblock-content').waitFor();
    await page.getByRole('combobox', { name: 'Code language' }).click();
    const codeOption = page.getByRole('option', { name: 'TypeScript' });
    await codeOption.waitFor();
    assert.equal(await codeOption.evaluate(element => {
      const color = getComputedStyle(element).color;
      const background = getComputedStyle(element.closest('[role="listbox"]') ?? element).backgroundColor;
      return color !== background;
    }), true, 'Language options must be visible in dark mode');
    await codeOption.click();
    await page.locator('.actiproc-codeblock-content').click();
    await page.keyboard.type('const message: string = "hello";');
    await page.keyboard.press('Enter');
    await page.keyboard.type('console.log(message);');
    const editorSnapshot = await page.evaluate(() =>
      document.querySelector('[data-test="note"] .tiptap').editor.getJSON());
    const activeCode = editorSnapshot.content.find(node => node.type === 'codeBlock');
    assert.equal(activeCode.attrs.language, 'typescript');
    assert.equal(activeCode.content[0].text, 'const message: string = "hello";\nconsole.log(message);');
    assert.equal(await page.getByRole('button', { name: 'Copy code' }).count(), 1);
    checks += 3;
    await page.evaluate((doc) => {
      const editor = document.querySelector('[data-test="note"] .tiptap').editor;
      editor.commands.setContent(doc);
    }, editorSnapshot);
    assert.deepEqual(
      await page.evaluate(() => document.querySelector('[data-test="note"] .tiptap').editor.getJSON()),
      editorSnapshot,
    );
    checks++;

    // HTML clipboard should be parsed by Tiptap with structure/marks preserved.
    await page.evaluate(() => {
      const editor = document.querySelector('[data-test="note"] .tiptap').editor;
      editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
      editor.commands.focus('end');
      const transfer = new DataTransfer();
      transfer.setData('text/html',
        '<h2>Imported heading</h2><p>Strong <strong>bold</strong> and <a href="https://example.org">link</a>.</p><ul><li>Item A</li></ul><pre><code class="language-python">def add(a, b):\n    return a + b</code></pre>');
      transfer.setData('text/plain', 'Imported heading\nStrong bold and link.\nItem A');
      editor.view.dom.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: transfer,
      }));
    });
    const pastedHtml = await page.evaluate(() =>
      document.querySelector('[data-test="note"] .tiptap').editor.getJSON());
    assert.ok(pastedHtml.content.some(node => node.type === 'heading' && node.attrs.level === 2));
    assert.ok(pastedHtml.content.some(node => node.type === 'bulletList'));
    assert.ok(pastedHtml.content.some(node => node.type === 'codeBlock' && node.attrs.language === 'python'));
    assert.ok(JSON.stringify(pastedHtml).includes('"type":"bold"'));
    assert.ok(JSON.stringify(pastedHtml).includes('"href":"https://example.org"'));
    checks += 5;

    // Fenced Markdown pasted as text becomes a code block, preserving newlines.
    await page.evaluate(() => {
      const editor = document.querySelector('[data-test="note"] .tiptap').editor;
      editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
      editor.commands.focus('end');
      const transfer = new DataTransfer();
      transfer.setData('text/plain', '~~~python\ndef func():\n    return 42\n~~~');
      editor.view.dom.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: transfer,
      }));
    });
    const pastedCode = await page.evaluate(() =>
      document.querySelector('[data-test="note"] .tiptap').editor.getJSON());
    assert.equal(pastedCode.content.find(node => node.type === 'codeBlock')?.attrs.language, 'python');
    assert.equal(pastedCode.content.find(node => node.type === 'codeBlock')?.content[0]?.text,
      'def func():\n    return 42');
    checks += 2;
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'rich note ' + width + 'px overflow');
      checks++;
    }
    // Handwriting block: draw with a pointer, change paper, undo/redo and
    // save/reload the editable vector strokes through canonical Note JSON.
    await page.setViewportSize({ width: 850, height: 900 });
    await page.getByRole('button', { name: 'Insert handwriting / drawing' }).click();
    await page.locator('[data-actiproc-drawing]').first().waitFor();
    assert.equal(await page.locator('[data-actiproc-drawing]').count(), 1);
    await page.getByRole('button', { name: 'Edit handwriting' }).click();
    const inkCanvas = page.getByLabel('Ink drawing canvas');
    await inkCanvas.waitFor();
    const bounds = await inkCanvas.boundingBox();
    assert.ok(bounds && bounds.width > 200 && bounds.height > 120);
    await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.60, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction(() => {
      const note = document.querySelector('[data-test="note"] .tiptap').editor.getJSON();
      return note.content.find(node => node.type === 'drawing')?.attrs?.drawing?.strokes?.length === 1;
    });
    const afterInk = await page.evaluate(() =>
      document.querySelector('[data-test="note"] .tiptap').editor.getJSON());
    const firstInk = afterInk.content.find(node => node.type === 'drawing')?.attrs?.drawing;
    assert.ok(firstInk.strokes[0].points.length > 2);
    assert.ok(firstInk.strokes[0].points.every(point => point.p > 0 && point.p <= 1));
    checks += 4;

    await page.getByRole('combobox', { name: 'Drawing paper style' }).click();
    await page.getByRole('option', { name: 'Grid' }).click();
    const gridInk = await page.evaluate(() =>
      document.querySelector('[data-test="note"] .tiptap').editor.getJSON()
        .content.find(node => node.type === 'drawing').attrs.drawing);
    assert.equal(gridInk.background, 'grid');
    await page.getByRole('button', { name: 'Undo drawing' }).click();
    const afterUndo = await page.evaluate(() =>
      document.querySelector('[data-test="note"] .tiptap').editor.getJSON()
        .content.find(node => node.type === 'drawing').attrs.drawing);
    assert.equal(afterUndo.background, 'ruled');
    await page.getByRole('button', { name: 'Redo drawing' }).click();
    const afterRedo = await page.evaluate(() =>
      document.querySelector('[data-test="note"] .tiptap').editor.getJSON()
        .content.find(node => node.type === 'drawing').attrs.drawing);
    assert.equal(afterRedo.background, 'grid');
    checks += 3;
    await page.getByRole('button', { name: 'Done' }).click();

    const snapshot = await page.evaluate(() =>
      document.querySelector('[data-test="note"] .tiptap').editor.getJSON());
    await page.evaluate((documentJSON) => {
      const editor = document.querySelector('[data-test="note"] .tiptap').editor;
      editor.commands.setContent(documentJSON);
    }, snapshot);
    assert.deepEqual(await page.evaluate(() =>
      document.querySelector('[data-test="note"] .tiptap').editor.getJSON()), snapshot);
    checks++;
    await page.setViewportSize({ width: 320, height: 850 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Handwriting preview must not overflow mobile screen');
    checks++;
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({ browserChecks: checks, screenshots: output, errors }),
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
