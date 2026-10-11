// Uses installed playwright-core + Chromium paths, never live Supabase.
// Optional --baseline compiles HEAD's Planner/TaskItem to demonstrate regressions.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');

async function main() {
  const baseline = process.argv.includes('--baseline');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-planner-paste-'));
  const plugins = [{ name: 'fixtures', setup(build) {
    build.onResolve({ filter: /^@\/components\/TaskContext$/ }, () => ({ path: path.resolve('scripts/fixtures/planner-loading.tsx') }));
    if (baseline) build.onLoad({ filter: /(?:PlannerToday\.tsx|AdvancedTaskItem\.ts)$/ }, args => ({
      contents: execFileSync('git', ['show', `HEAD:${path.relative(process.cwd(), args.path).replaceAll('\\', '/')}`], { encoding: 'utf8' }),
      loader: 'tsx', resolveDir: path.dirname(args.path),
    }));
  } }];
  for (const [name, entry] of [['planner', 'scripts/fixtures/planner-loading.tsx'], ['editor', 'scripts/fixtures/checklist-layout.tsx']]) {
    await esbuild.build({ entryPoints: [entry], outfile: path.join(output, `${name}.js`), plugins,
      bundle: true, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  }
  const server = http.createServer((req, res) => {
    if (req.url.endsWith('.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(output, path.basename(req.url)))); }
    else { res.setHeader('Content-Type', 'text/html'); res.end(`<html><body><div id="root"></div><script src="/${req.url.includes('planner') ? 'planner' : 'editor'}.js"></script></body></html>`); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = require(path.resolve(process.argv[2]));
  const browser = await chromium.launch({ executablePath: path.resolve(process.argv[3]), headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/planner`);
    await page.waitForFunction(() => window.qa?.finishBootstrap);
    await page.waitForTimeout(1000);
    const beforeBootstrap = await page.evaluate(() => ({ calls: window.qa.calls.length, rendered: document.body.textContent.includes('Nothing scheduled for today') }));
    if (!baseline) assert.deepEqual(beforeBootstrap, { calls: 1, rendered: true });
    await page.evaluate(() => window.qa.finishBootstrap());
    await page.getByText('Nothing scheduled for today').waitFor();
    await page.waitForTimeout(500);
    const calls = await page.evaluate(() => window.qa.calls);
    if (!baseline) assert.equal(calls.length, 1, 'Board bootstrap must not issue a duplicate Planner GET');
    await page.evaluate(() => window.qa.navigate(false));
    await page.waitForTimeout(30);
    await page.evaluate(() => window.qa.navigate(true));
    await page.getByText('Nothing scheduled for today').waitFor();
    await page.waitForTimeout(200);

    await page.goto(`http://127.0.0.1:${server.address().port}/editor`);
    await page.waitForFunction(() => document.querySelector('.tiptap')?.editor);
    const pasted = await page.evaluate(async () => {
      const editor = document.querySelector('.tiptap').editor;
      const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Important copied text', marks: [{ type: 'bold' }] }] };
      const original = { type: 'taskItem', attrs: { id: 'original', checked: false, assigneeId: 'member-1', dueDate: '2026-10-11', reminders: [] }, content: [paragraph] };
      editor.commands.setContent({ type: 'doc', content: [{ type: 'taskList', content: [original] }] });
      const html = editor.getHTML();
      editor.commands.insertContentAt(0, { type: 'paragraph' });
      editor.commands.setTextSelection(1);
      editor.view.pasteHTML(html);
      await new Promise(resolve => setTimeout(resolve, 50));
      const doc = editor.getJSON();
      const ids = []; doc.content.forEach(list => list.content?.forEach(node => { if (node.type === 'taskItem') ids.push(node.attrs.id); }));
      return { ids, doc, saved: window.qa.saved, html };
    });
    if (!baseline) {
      assert.equal(pasted.ids.length, 2);
      assert.equal(new Set(pasted.ids).size, 2, 'API rejects duplicate checklist identities');
      assert.equal(pasted.ids[1], 'original', 'paste before source must retain original identity');
      assert.equal(pasted.doc.content.find(node => node.type === 'taskList').content[0].attrs.dueDate, null);
      assert.match(JSON.stringify(pasted.saved), /Important copied text/);
      assert.match(JSON.stringify(pasted.saved), /bold/);
      await page.evaluate(doc => document.querySelector('.tiptap').editor.commands.setContent(doc), pasted.saved);
      assert.deepEqual(await page.evaluate(() => document.querySelector('.tiptap').editor.getJSON()), pasted.saved, 'reopen preserves saved rich document');
      await page.evaluate(() => {
        const editor = document.querySelector('.tiptap').editor;
        editor.commands.focus('end'); editor.view.pasteText(' plain clipboard text');
      });
      assert.match(await page.evaluate(() => JSON.stringify(window.qa.saved)), /plain clipboard text/);
      const scenarios = await page.evaluate(async () => {
        const editor = document.querySelector('.tiptap').editor;
        const items = () => {
          const result = [];
          editor.state.doc.descendants(node => { if (node.type.name === 'taskItem') result.push(node.toJSON()); });
          return result;
        };
        // Imported nested HTML gets identities before onUpdate/autosave observes it.
        editor.commands.focus('end');
        editor.view.pasteHTML('<ul data-type="taskList"><li data-type="taskItem"><p>Parent</p><ul data-type="taskList"><li data-type="taskItem"><p><em>Child</em></p></li></ul></li></ul>');
        const nested = items();
        const afterPaste = editor.getJSON();
        editor.commands.undo(); editor.commands.redo();
        const redo = editor.getJSON();
        let originalPosition;
        editor.state.doc.descendants((node, pos) => { if (node.attrs.id === 'original') originalPosition = pos; });
        editor.commands.setNodeSelection(originalPosition);
        const clipboard = new DataTransfer();
        editor.view.dom.dispatchEvent(new ClipboardEvent('cut', { bubbles: true, cancelable: true, clipboardData: clipboard }));
        const cutHtml = clipboard.getData('text/html');
        editor.commands.focus('end'); editor.view.pasteHTML(cutHtml);
        const moved = items().filter(node => node.attrs.id === 'original');
        // Split inside text uses default TipTap list handling; IDs must not duplicate.
        let split;
        editor.state.doc.descendants((node, pos) => { if (node.attrs.id === 'original') split = pos + 5; });
        editor.commands.setTextSelection(split);
        editor.commands.splitListItem('taskItem');
        await new Promise(resolve => setTimeout(resolve, 40));
        return { nested, afterPaste, redo, cutHtml, moved, split: items(), saved: window.qa.saved };
      });
      assert.equal(new Set(scenarios.nested.map(item => item.attrs.id)).size, scenarios.nested.length);
      assert.ok(scenarios.nested.every(item => item.attrs.id));
      assert.match(JSON.stringify(scenarios.nested), /italic/);
      assert.deepEqual(scenarios.redo, scenarios.afterPaste, 'undo/redo retains pasted identities');
      assert.ok(scenarios.cutHtml);
      assert.equal(scenarios.moved.length, 1, 'cut/paste retains the source identity');
      assert.equal(scenarios.moved[0].attrs.dueDate, '2026-10-11', 'cut/paste keeps scheduling metadata');
      assert.equal(new Set(scenarios.split.map(item => item.attrs.id)).size, scenarios.split.length);
      assert.ok(scenarios.split.every(item => item.attrs.id));
    }
    console.log(JSON.stringify({ baseline, beforeBootstrap, calls, pastedIds: pasted.ids, output }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
