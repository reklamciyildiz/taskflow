// Usage: node scripts/test-checklist-layout-browser.cjs <playwright-core> <chromium>
// Real editor, DOM, marks and interactions; no live production persistence claim.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');

async function main() {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-checklist-qa-'));
  await esbuild.build({ entryPoints: ['scripts/fixtures/checklist-layout.tsx'], outfile: path.join(output, 'app.js'),
    bundle: true, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
  const css = await postcss([tailwind('./tailwind.config.ts')]).process(fs.readFileSync('app/globals.css', 'utf8'), { from: 'app/globals.css' });
  fs.writeFileSync(path.join(output, 'app.css'), css.css);
  const server = http.createServer((req, res) => {
    if (['/app.js', '/app.css'].includes(req.url)) {
      res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(fs.readFileSync(path.join(output, req.url.slice(1))));
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = require(path.resolve(process.argv[2]));
  const browser = await chromium.launch({ executablePath: path.resolve(process.argv[3]), headless: true });
  let checks = 0;
  const errors = [];
  const limitations = [];
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 1000 }, hasTouch: true });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => document.querySelector('.tiptap')?.editor);
    // The production editor installs context in storage after mount. Reopen the
    // persisted document as ActionPanel does so NodeViews see the member context.
    await page.evaluate(() => {
      window.qa.editor = document.querySelector('.tiptap').editor;
      window.qa.editor.commands.setContent(window.qa.seed);
    });
    await page.locator('.checklist-item-layout').first().waitFor();
    const before = await page.evaluate(() => ({ doc: window.qa.editor.getJSON(), updates: window.qa.updates }));
    const measurements = [];
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme);
      for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const result = await page.evaluate(() => {
          const rows = [...document.querySelectorAll('.checklist-item-layout')].map(row => {
            const p = row.querySelector('.checklist-item-content > [data-node-view-content-react] > p');
            const meta = [...row.querySelectorAll('.checklist-item-metadata')].find(el => el.closest('.checklist-item-layout') === row);
            const list = row.querySelector('.checklist-item-content > [data-node-view-content-react] > ul');
            const rect = p.getBoundingClientRect();
            const m = meta?.getBoundingClientRect();
            return { id: row.dataset.taskId, width: rect.width, rowWidth: row.clientWidth,
              below: m ? m.top >= rect.bottom - 1 : null,
              aligned: m ? Math.abs(m.left - rect.left) < 1 : null,
              childBelow: m && list ? list.getBoundingClientRect().top >= m.bottom - 1 : true,
              metadata: !!meta };
          });
          return { overflow: document.documentElement.scrollWidth > innerWidth, rows };
        });
        assert.equal(result.overflow, false, `${theme} ${width}: page overflow`); checks++;
        for (const row of result.rows) {
          assert.ok(row.width >= 150, `${width} ${row.id} text width=${row.width}`); checks++;
          if (row.metadata && row.rowWidth < 608) {
            assert.ok(row.below && row.aligned, `${width} ${row.id}: metadata must be below/aligned`); checks++;
          }
          if (row.metadata && row.rowWidth >= 608) { assert.equal(row.below, false, 'wide row stays compact'); checks++; }
          assert.ok(row.childBelow, `${row.id}: child list overlaps parent metadata`); checks++;
        }
        assert.equal(result.rows.find(row => row.id === 'plain').metadata, false); checks++;
        measurements.push({ theme, width, minText: Math.min(...result.rows.map(row => row.width)) });
        await page.screenshot({ path: path.join(output, `${theme}-${width}.png`), fullPage: true });
      }
    }
    assert.deepEqual(await page.evaluate(() => ({ doc: window.qa.editor.getJSON(), updates: window.qa.updates })), before,
      'responsive changes must not change JSON or trigger autosave'); checks++;
    await page.setViewportSize({ width: 320, height: 1000 });
    // Same viewport, different panel width: the row decides, not a media query.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => document.querySelector('main').style.maxWidth = '320px');
    assert.ok(await page.locator('[data-task-id="both"] .checklist-item-metadata').evaluate(el => el.getBoundingClientRect().top > el.parentElement.parentElement.querySelector('p').getBoundingClientRect().top)); checks++;
    await page.evaluate(() => document.querySelector('main').style.maxWidth = '1120px');
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.locator('[data-task-id="both"]').getByRole('button', { name: /^Schedule checklist/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Schedule checklist item' });
    await dialog.waitFor();
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320); checks++;
    const scheduleBefore = await page.evaluate(() => ({ doc: window.qa.editor.getJSON(), updates: window.qa.updates }));
    let rejectSchedule = false;
    let scheduleRequests = 0;
    await page.route('**/api/schedules', async route => {
      scheduleRequests++;
      const input = route.request().postDataJSON();
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.fulfill(rejectSchedule
        ? { status: 500, json: { error: 'Fixture save rejected' } }
        : { json: { success: true, data: { id: 'schedule-1', recurrenceWeekdays: [], reminderRules: [], ...input } } });
    });
    await dialog.getByRole('button', { name: 'Tomorrow', exact: true }).click();
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    const scheduleBadge = page.locator('[data-task-id="both"]').getByRole('button', { name: /^Schedule checklist/ });
    const savedLabel = await scheduleBadge.textContent();
    assert.equal(scheduleRequests, 1); checks++;
    await scheduleBadge.click();
    rejectSchedule = true;
    await dialog.getByRole('button', { name: 'Today', exact: true }).click();
    await page.getByText('Fixture save rejected', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await scheduleBadge.textContent(), savedLabel, 'failed schedule mutation restores badge'); checks++;
    assert.deepEqual(await page.evaluate(() => ({ doc: window.qa.editor.getJSON(), updates: window.qa.updates })), scheduleBefore,
      'schedule UI changes must not dirty TipTap content'); checks++;
    await page.locator('[data-task-id="both"]').getByRole('button', { name: /^Assign checklist/ }).click();
    await page.getByRole('menuitem', { name: 'Other Member' }).click();
    assert.equal(await page.evaluate(() => {
      let attrs; window.qa.editor.state.doc.descendants(n => { if (n.attrs.id === 'both') attrs = n.attrs; }); return attrs.assigneeId;
    }), 'member-2'); checks++;
    // Keyboard behavior through the actual BlockEditor handleKeyDown/extensions.
    await page.evaluate(() => window.qa.ref.current.focusTaskItem('plain'));
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('New task');
    assert.equal(await page.evaluate(() => window.qa.editor.isActive('taskItem')), true); checks++;
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => window.qa.editor.state.selection.$from.depth) > 3); checks++;
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => window.qa.editor.state.selection.$from.depth), 3); checks++;
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Second line');
    assert.match(await page.evaluate(() => JSON.stringify(window.qa.editor.getJSON())), /hardBreak/); checks++;
    const plain = page.locator('[data-task-id="plain"]');
    await plain.getByRole('checkbox').first().click();
    await page.waitForTimeout(900);
    assert.equal(await plain.getAttribute('data-checked'), 'true'); checks++;
    await plain.getByRole('checkbox').first().click();
    await page.waitForTimeout(200);
    assert.equal(await plain.getAttribute('data-checked'), 'false'); checks++;
    const persisted = await page.evaluate(() => window.qa.editor.getJSON());
    await page.evaluate(doc => window.qa.editor.commands.setContent(doc), persisted);
    assert.deepEqual(await page.evaluate(() => window.qa.editor.getJSON()), persisted); checks++;

    // DOM selection in a nested paragraph must still map to the same PM node.
    await page.evaluate(() => {
      window.qa.ref.current.focusTaskItem('deep-8');
      document.querySelector('[data-task-id="deep-8"] p').scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(300);
    const textRect = await page.evaluate(() => {
      const p = document.querySelector('[data-task-id="deep-8"] p');
      const range = document.createRange(); range.setStart(p.firstChild, 0); range.setEnd(p.firstChild, 8);
      return range.getBoundingClientRect().toJSON();
    });
    await page.mouse.move(textRect.left + 1, textRect.top + textRect.height / 2);
    await page.mouse.down();
    await page.mouse.move(textRect.right, textRect.top + textRect.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const bold = page.getByRole('button', { name: 'Bold', exact: true });
    const toolbarBounds = await bold.boundingBox();
    if (toolbarBounds && toolbarBounds.x >= 0 && toolbarBounds.y >= 0 && toolbarBounds.y < 972) {
      await bold.click(); checks++;
    } else {
      // Reproduced with HEAD's original NodeView too: the existing BubbleMenu
      // can position outside this standalone scrolled fixture. Do not claim a
      // passing toolbar-position test or change unrelated toolbar architecture.
      limitations.push('Scrolled BubbleMenu positioning also fails with the original NodeView; verify in the deployed ActionPanel. Partial formatting tested with Ctrl+B.');
      await page.screenshot({ path: path.join(output, 'bubble-position-limitation.png') });
      await page.keyboard.press('Control+b');
    }
    assert.ok(await page.locator('[data-task-id="deep-8"] strong').count()); checks++;
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('[data-task-id="deep-8"] strong').count(), 0); checks++;
    await page.keyboard.press('Control+Shift+z');
    assert.ok(await page.locator('[data-task-id="deep-8"] strong').count()); checks++;
    const selection = await page.evaluate(() => window.qa.editor.state.selection.toJSON());
    await page.setViewportSize({ width: 430, height: 1000 });
    assert.deepEqual(await page.evaluate(() => window.qa.editor.state.selection.toJSON()), selection); checks++;
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type(' caret');
    assert.match(await page.locator('[data-task-id="deep-8"] p').textContent(), /caret/); checks++;

    // Parent/child completion must keep structure, IDs and schedule attributes.
    const treeBefore = await page.evaluate(() => window.qa.editor.getJSON());
    const parent = page.locator('[data-task-id="deep-1"]');
    await parent.getByRole('checkbox').first().click();
    await page.waitForTimeout(900);
    assert.equal(await parent.getAttribute('data-checked'), 'true'); checks++;
    assert.equal(await page.locator('[data-task-id="deep-8"]').getAttribute('data-checked'), 'false'); checks++;
    await parent.getByRole('checkbox').first().click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-task-id="deep-1"] [data-task-id="deep-8"]').count(), 1); checks++;
    const treeAfter = await page.evaluate(() => window.qa.editor.getJSON());
    const byId = (doc, id) => doc.attrs?.id === id ? doc : doc.content?.map(node => byId(node, id)).find(Boolean);
    assert.deepEqual(byId(treeAfter, 'deep-1'), byId(treeBefore, 'deep-1')); checks++;

    // Quick capture stays first; slash + heading Enter uses the existing handler.
    await page.evaluate(() => window.qa.ref.current.prependTaskItem('Quick capture'));
    assert.equal(await page.evaluate(() => window.qa.editor.getJSON().content[0].content[0].content[0].content[0].text), 'Quick capture'); checks++;
    const fullDoc = await page.evaluate(() => window.qa.editor.getJSON());
    await page.evaluate(() => { window.qa.editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] }); window.qa.editor.commands.focus('end'); });
    await page.keyboard.type('/');
    await page.getByRole('option', { name: 'Section heading' }).click();
    await page.keyboard.type('Section');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Under heading');
    // StarterKit may also append its existing trailing empty paragraph.
    assert.deepEqual(await page.evaluate(() => window.qa.editor.getJSON().content.slice(0, 2).map(n => n.type)), ['heading', 'taskList']); checks++;
    assert.equal(await page.evaluate(() => window.qa.editor.isActive('taskItem')), true); checks++;
    await page.evaluate(doc => window.qa.editor.commands.setContent(doc), fullDoc);

    // Actual touch reorder handler, with the real nested DOM hit testing.
    await page.locator('[data-task-id="plain"]').scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const source = document.querySelector('[data-task-id="plain"]');
      const target = document.querySelector('[data-task-id="assignee"]');
      const handle = source.querySelector('[data-drag-handle]');
      const s = handle.getBoundingClientRect(), t = target.getBoundingClientRect();
      const start = new Touch({ identifier: 1, target: handle, clientX: s.left + 4, clientY: s.top + 4 });
      handle.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start] }));
      const move = new Touch({ identifier: 1, target: handle, clientX: t.left + 50, clientY: t.bottom - 8 });
      document.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [move] }));
      document.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }));
    });
    const order = await page.evaluate(() => window.qa.editor.getJSON().content.flatMap(n => n.type === 'taskList' ? (n.content ?? []).map(c => c.attrs.id) : []));
    assert.ok(order.indexOf('plain') > order.indexOf('assignee'), 'touch reorder persists document order'); checks++;

    // Conversion retains rich content. Metadata is UI, not extra document nodes.
    await page.locator('[data-task-id="deep-8"]').getByRole('button', { name: 'Checklist item actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Convert to Note', exact: true }).click();
    await page.getByRole('dialog', { name: 'Convert to Note' }).getByRole('button', { name: 'Create note' }).click();
    assert.match(await page.evaluate(() => JSON.stringify(window.qa.conversions.at(-1))), /bold/); checks++;

    // ActionPanel's existing Hide done selector must beat the layout display rule.
    await page.evaluate(() => document.querySelector('main').classList.add('[&_[data-type=taskItem][data-checked=true]:not([data-completion-pending=true])]:hidden'));
    assert.equal(await page.locator('[data-task-id="completed"]').isVisible(), false); checks++;
    await page.evaluate(() => document.querySelector('main').classList.remove('[&_[data-type=taskItem][data-checked=true]:not([data-completion-pending=true])]:hidden'));
    assert.equal(await page.locator('[data-task-id="completed"]').isVisible(), true); checks++;

    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ checks, measurements, limitations, screenshots: output }, null, 2));
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
