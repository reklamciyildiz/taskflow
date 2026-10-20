// Usage: node scripts/test-board-table-browser.cjs <playwright-core directory> <chromium executable>
// Isolated component E2E, NOT a production-session or live Supabase test.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');

async function main() {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-board-table-qa-'));
  const fixture = path.resolve('scripts/fixtures/board-table.tsx');
  await esbuild.build({ entryPoints: [fixture], outfile: path.join(output, 'app.js'), bundle: true, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'workspace-fixture', setup(build) {
      build.onResolve({ filter: /components\/(TaskContext|CreateProjectModal|CreateTaskModal|EditGeneralBoardModal)$/ }, () => ({ path: fixture }));
    } }],
  });
  const css = await postcss([tailwind('./tailwind.config.ts')]).process(fs.readFileSync('app/globals.css', 'utf8'), { from: 'app/globals.css' });
  fs.writeFileSync(path.join(output, 'app.css'), css.css);
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js' || req.url === '/app.css') {
      res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(fs.readFileSync(path.join(output, req.url.slice(1))));
    } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="bg-background text-foreground"><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = require(path.resolve(process.argv[2]));
  const browser = await chromium.launch({ executablePath: path.resolve(process.argv[3]), headless: true });
  const errors = [];
  let checks = 0;
  try {
    for (const width of [320, 375, 430, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 768 });
      page.on('pageerror', error => errors.push(error.message));
      let failNext = false;
      let failProperty = false;
      let readDelay = 0;
      let taskWriteDelay = 120;
      let preferencePatchDelay = 0;
      let savedProcessOrder = [];
      let values = [];
      const property = { id: 'region', project_id: 'p1', name: 'Region', type: 'single_select', position: 0, archived_at: null };
      const option = { id: 'eu', project_id: 'p1', property_id: 'region', label: 'Europe', color: 'blue', position: 0, archived_at: null };
      await page.route('**/api/users/preferences', async route => {
        if (route.request().method() === 'PATCH') {
          if (preferencePatchDelay) await new Promise(resolve => setTimeout(resolve, preferencePatchDelay));
          const body = route.request().postDataJSON();
          if (body.processOrder) savedProcessOrder = body.processOrder;
        }
        await route.fulfill({ json: { success: true, data: {
          processOrderByTeam: savedProcessOrder.length ? { team: savedProcessOrder } : {},
        } } });
      });
      await page.route('**/api/projects/*/properties?*', async route => {
        const data = { properties: [property], options: [option], values: [...values] };
        if (readDelay) await new Promise(resolve => setTimeout(resolve, readDelay));
        await route.fulfill({ json: { data } });
      });
      await page.route('**/api/tasks/*/properties', async route => {
        await new Promise(resolve => setTimeout(resolve, 120));
        if (failProperty) { failProperty = false; await route.fulfill({ status: 500, json: { error: 'Property save failed' } }); return; }
        const { propertyId, optionId } = route.request().postDataJSON();
        const taskId = route.request().url().split('/').at(-2);
        values = values.filter(value => value.task_id !== taskId || value.property_id !== propertyId);
        if (optionId) values.push({ task_id: taskId, property_id: propertyId, option_id: optionId, project_id: 'p1' });
        await route.fulfill({ json: { success: true } });
      });
      await page.route('**/fixture/tasks/*', async route => {
        const fail = failNext; failNext = false;
        await new Promise(resolve => setTimeout(resolve, taskWriteDelay));
        await route.fulfill({ status: fail ? 500 : 200, json: { success: !fail } });
      });
      const noOverflow = async label => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px ${label}: document overflow`); checks++;
      };
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const checkbox = page.getByRole('checkbox', { name: 'Mark Open Action complete', exact: true });
      await checkbox.waitFor();
      await noOverflow('Table');
      assert.equal(await checkbox.isChecked(), false);
      assert.equal(await page.getByRole('checkbox', { name: 'Mark Closed Action open', exact: true }).isChecked(), true);
      assert.equal(await page.getByRole('checkbox', { name: 'Mark Category Action complete', exact: true }).isChecked(), false); checks += 3;
      await checkbox.click();
      await page.getByRole('button', { name: 'Reddedildi', exact: true }).click();
      await page.waitForFunction(() => window.qa.tasks.find(task => task.id === 'a').status === 'rejected');
      await page.waitForTimeout(200);
      await page.getByRole('checkbox', { name: 'Mark Open Action open', exact: true }).click();
      await page.getByRole('button', { name: 'Yapılacaklar', exact: true }).click();
      await page.waitForTimeout(200); checks += 2;
      const priority = page.getByRole('combobox', { name: 'Priority for Open Action', exact: true });
      failNext = true;
      await priority.click(); await page.getByRole('option', { name: 'High', exact: true }).click();
      await page.waitForFunction(() => window.qa.tasks.find(task => task.id === 'a').priority === 'high');
      await page.waitForFunction(() => window.qa.tasks.find(task => task.id === 'a').priority === 'low'); checks++;
      await page.mouse.move(0, 0);
      await page.locator('[data-sonner-toast]').waitFor({ state: 'detached' });
      if (width < 768) {
        await page.getByRole('button', { name: 'More details for Open Action', exact: true }).click();
      }
      await page.getByRole('combobox', { name: 'Region for Open Action', exact: true }).click();
      await page.getByRole('option', { name: 'Europe', exact: true }).click();
      await page.waitForTimeout(300);
      if (width === 375) {
        const region = page.getByRole('combobox', { name: 'Region for Open Action', exact: true });
        failProperty = true;
        await region.click(); await page.getByRole('option', { name: 'Unassigned', exact: true }).click();
        await page.waitForTimeout(350);
        assert.match(await region.textContent(), /Europe/, 'failed property edit rolls back under StrictMode');
        await page.mouse.move(0, 0); await page.locator('[data-sonner-toast]').waitFor({ state: 'detached' });
        readDelay = 400;
        const read = page.waitForRequest(request => request.url().includes('/api/projects/'));
        await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await read;
        await region.click(); await page.getByRole('option', { name: 'Unassigned', exact: true }).click();
        await page.waitForTimeout(700);
        assert.match(await region.textContent(), /Unassigned/, 'stale property GET cannot overwrite a newer edit');
        readDelay = 0;
        await region.click(); await page.getByRole('option', { name: 'Europe', exact: true }).click();
        await page.waitForTimeout(300); checks += 2;
      }
      await page.getByRole('button', { name: 'Open Action', exact: true }).click();
      assert.equal(await page.getByTestId('context-status').textContent(), 'open');
      await page.getByRole('button', { name: 'Close Action', exact: true }).click(); checks++;
      await priority.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
      assert.equal(await priority.evaluate(element => document.activeElement === element), true); checks++;
      await page.getByRole('button', { name: 'Board fixture' }).click();
      await page.getByRole('button', { name: 'Move or edit Open Action', exact: true }).waitFor();
      await noOverflow('Board');
      if (width === 375) {
        await page.getByRole('button', { name: 'Active process / project' }).click();
        const taskFlowDown = page.getByRole('button', { name: 'Move SmartSafe AI down', exact: true });
        await taskFlowDown.click();
        assert.deepEqual(savedProcessOrder, ['p2', 'p1']);
        await page.getByRole('button', { name: 'Other Process', exact: true }).click();
        await page.getByRole('button', { name: 'Other Process Action', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Active process / project' }).click();
        assert.equal(await page.getByRole('button', { name: 'Move Other Process up', exact: true }).isDisabled(), true);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Active process / project' }).click();
        await page.getByRole('button', { name: 'SmartSafe AI', exact: true }).click();
        checks += 3;
      }
      if (width === 430) {
        await page.getByRole('button', { name: 'Active process / project' }).click();
        const handle = page.getByRole('button', { name: 'Reorder SmartSafe AI', exact: true });
        const processListBounds = await page.getByLabel('Processes', { exact: true }).boundingBox();
        const handleBounds = await handle.boundingBox();
        assert.ok(processListBounds && handleBounds);
        await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + handleBounds.height / 2);
        await page.mouse.down();
        await page.mouse.move(handleBounds.x + handleBounds.width / 2, handleBounds.y + handleBounds.height / 2 + 8, { steps: 4 });
        const dragClone = page.locator('body > [data-rfd-draggable-id="p1"]');
        await dragClone.waitFor();
        const cloneBounds = await dragClone.boundingBox();
        assert.ok(cloneBounds && cloneBounds.x >= processListBounds.x - 4 && cloneBounds.x + cloneBounds.width <= processListBounds.x + processListBounds.width + 4,
          'drag preview stays aligned with the Process dropdown');
        await page.keyboard.press('Escape');
        await page.mouse.up();
        checks++;
        await handle.focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        for (let attempt = 0; attempt < 50 && savedProcessOrder[0] !== 'p2'; attempt++)
          await new Promise(resolve => setTimeout(resolve, 10));
        assert.deepEqual(savedProcessOrder, ['p2', 'p1']);
        await page.keyboard.press('Escape');
        checks++;
      }
      if (width < 768) {
        await page.getByRole('combobox', { name: 'Active board group' }).click();
        await page.getByRole('option', { name: 'Empty group (0)', exact: true }).click();
        await page.getByText('No Actions in this group.', { exact: true }).waitFor();
        await page.getByRole('combobox', { name: 'Active board group' }).click();
        await page.getByRole('option', { name: /Yapılacaklar/ }).click(); checks++;
      }
      await page.getByRole('button', { name: 'Move or edit Open Action', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Kabul edildi', exact: true }).click();
      await page.waitForFunction(() => window.qa.tasks.find(task => task.id === 'a').status === 'closed');
      await page.waitForTimeout(200);
      if (width < 768) await page.getByRole('button', { name: 'Group by Stage', exact: true }).click();
      await page.getByRole('combobox', { name: 'Group board by', exact: true }).click();
      await page.getByRole('option', { name: 'Region', exact: true }).click();
      await page.getByRole('button', { name: 'Open Action', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.qa.tasks.find(task => task.id === 'a').status), 'closed');
      await noOverflow('property Board');
      await page.getByRole('combobox', { name: 'Group board by', exact: true }).click();
      await page.getByRole('option', { name: 'Stage', exact: true }).click(); checks++;
      if (width >= 768) {
        const dragHandle = page.locator('[data-rfd-drag-handle-draggable-id="dense0"]');
        await dragHandle.focus(); await page.keyboard.press('Space'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space');
        await page.waitForTimeout(250);
        assert.equal(await page.evaluate(() => window.qa.tasks.find(task => task.id === 'dense0').status), 'open'); checks++;
      }
      if (width < 768) {
        await page.getByRole('combobox', { name: 'Filter by stage', exact: true }).click();
        await page.getByRole('option', { name: 'İşimiz Bitti', exact: true }).click();
      } else await page.getByRole('button', { name: 'İşimiz Bitti', exact: true }).click();
      await page.getByRole('button', { name: 'Active process / project' }).click();
      await page.getByRole('button', { name: 'Other Process', exact: true }).click();
      await page.getByRole('button', { name: 'Other Process Action', exact: true }).waitFor(); checks++;
      await page.screenshot({ path: path.join(output, `board-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Table fixture' }).click();
      assert.equal(await page.getByRole('checkbox', { name: 'No terminal stage configured for Other Process Action', exact: true }).isDisabled(), true); checks++;
      await page.getByRole('button', { name: 'Board fixture' }).click();
      await page.getByRole('button', { name: 'Active process / project' }).click();
      await page.getByRole('button', { name: 'SmartSafe AI', exact: true }).click();
      await page.getByRole('button', { name: 'Table fixture' }).click();
      assert.equal(await page.getByRole('checkbox', { name: 'Mark Open Action open', exact: true }).isChecked(), true); checks++;
      if (width === 375) {
        failNext = true;
        const result = await page.evaluate(async () => Promise.all([
          window.qa.edit('a', { status: 'open' }), window.qa.edit('a', { priority: 'urgent' }),
        ]));
        assert.deepEqual(result, [false, true]);
        assert.equal(await page.evaluate(() => window.qa.tasks.find(task => task.id === 'a').status), 'closed');
        assert.equal(await page.evaluate(() => window.qa.tasks.find(task => task.id === 'a').priority), 'urgent'); checks += 3;
      }
      await page.evaluate(() => window.qa.setRecurring());
      assert.equal(await page.getByRole('checkbox', { name: 'Complete occurrences of Open Action in Planner', exact: true }).isDisabled(), true); checks++;
      await page.evaluate(() => window.qa.setViewer(true));
      await page.waitForTimeout(50);
      assert.equal(await priority.isDisabled(), true); checks++;
      await noOverflow('read-only Table');
      await page.screenshot({ path: path.join(output, `table-${width}.png`), fullPage: true });
      if (width === 1440) {
        // Real Planner component: Process Done changes, while every task stays unchanged.
        await page.evaluate(() => window.qa.setViewer(false));
        let done = false;
        let holdNextToday = false;
        let releaseOld;
        const makeItem = date => ({
          id: `s:${date}`, source: { sourceType: 'action', taskId: 'dense0' }, scheduleId: 's',
          scheduleDate: date, occurrenceDate: date, effectiveDate: date, state: done ? 'completed' : 'pending',
          completedAt: null, organizationId: 'org', teamId: 'team', taskId: 'dense0', taskTitle: 'Dense Action 0',
          checklistItemId: null, checklistItemText: null, projectId: 'p1', projectName: 'SmartSafe AI', assigneeId: null,
          scheduleTime: null, timeZone: null, isRecurring: false, recurrenceFrequency: null,
          recurrenceInterval: 1, recurrenceWeekdays: [], endsOn: null, reminderRules: [], missedCount: 0,
        });
        await page.route('**/api/planner/today?*', async route => {
          const date = new URL(route.request().url()).searchParams.get('date');
          const item = makeItem(date);
          const data = { date, overdue: [], today: done ? [] : [item], completedToday: done ? [item] : [] };
          if (holdNextToday) {
            holdNextToday = false;
            await new Promise(resolve => { releaseOld = resolve; });
          }
          await route.fulfill({ json: { success: true, data } });
        });
        await page.route('**/api/planner/upcoming?*', route => {
          const date = new URL(route.request().url()).searchParams.get('startDate');
          return route.fulfill({ json: { success: true, data: { startDate: date, endDate: date, groups: [{ date, items: [makeItem(date)] }] } } });
        });
        await page.evaluate(() => window.qa.setSurface('planner'));
        await page.getByRole('checkbox', { name: 'Complete Dense Action 0', exact: true }).waitFor();
        const checklistItem = (itemDate, checklistItemId, text) => ({
          ...makeItem(itemDate), id: `s:${itemDate}:${checklistItemId}`,
          source: { sourceType: 'checklist_item', taskId: 'dense0', checklistItemId },
          checklistItemId, checklistItemText: text,
        });
        taskWriteDelay = 900;
        const checklistTodayRoute = route => {
          const currentDate = new URL(route.request().url()).searchParams.get('date');
          return route.fulfill({ json: { success: true, data: {
            date: currentDate, overdue: [], completedToday: [], today: [
              checklistItem(currentDate, 'check-a', 'Checklist A'), checklistItem(currentDate, 'check-b', 'Checklist B'),
            ],
          } } });
        };
        await page.route('**/api/planner/today?*', checklistTodayRoute);
        await page.evaluate(() => window.dispatchEvent(new Event('axiom:schedule-changed')));
        const firstChecklist = page.getByRole('checkbox', { name: 'Complete Checklist A', exact: true });
        const secondChecklist = page.getByRole('checkbox', { name: 'Complete Checklist B', exact: true });
        await firstChecklist.waitFor();
        await firstChecklist.click();
        assert.equal(await secondChecklist.isDisabled(), false);
        await secondChecklist.click();
        assert.equal(await page.getByRole('checkbox', { name: 'Mark Checklist A incomplete', exact: true }).isChecked(), true);
        assert.equal(await page.getByRole('checkbox', { name: 'Mark Checklist B incomplete', exact: true }).isChecked(), true);
        checks += 3;
        await page.waitForTimeout(1900);
        await page.unroute('**/api/planner/today?*', checklistTodayRoute);
        taskWriteDelay = 120;
        await page.evaluate(() => window.dispatchEvent(new Event('axiom:schedule-changed')));
        await page.getByRole('checkbox', { name: 'Complete Dense Action 0', exact: true }).waitFor();
        const snapshot = await page.evaluate(() => JSON.stringify(window.qa.tasks));
        done = true; await page.evaluate(() => window.qa.setDone(true));
        await page.getByRole('checkbox', { name: 'Mark Dense Action 0 incomplete', exact: true }).waitFor(); checks++;
        await page.getByRole('tab', { name: 'upcoming', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Mark Dense Action 0 incomplete', exact: true }).waitFor();
        done = false; await page.evaluate(() => window.qa.setDone(false));
        await page.getByRole('checkbox', { name: 'Complete Dense Action 0', exact: true }).waitFor(); checks++;
        holdNextToday = true;
        await page.evaluate(() => window.dispatchEvent(new Event('axiom:occurrence-changed')));
        while (!releaseOld) await new Promise(resolve => setTimeout(resolve, 10));
        done = true; await page.evaluate(() => window.qa.setDone(true));
        await page.getByRole('checkbox', { name: 'Mark Dense Action 0 incomplete', exact: true }).waitFor();
        releaseOld(); await page.waitForTimeout(150);
        await page.getByRole('tab', { name: 'today', exact: true }).click();
        await page.getByRole('checkbox', { name: 'Mark Dense Action 0 incomplete', exact: true }).waitFor(); checks++;
        assert.equal(await page.evaluate(() => JSON.stringify(window.qa.tasks)), snapshot); checks++;
        await page.getByRole('button', { name: 'Table fixture', exact: true }).click();
        assert.equal(await page.getByRole('checkbox', { name: 'Mark Dense Action 0 open', exact: true }).isChecked(), true); checks++;
        console.log('Done configuration: Today/Upcoming reclassification, stale GET rejection, Table synchronization and unchanged task state passed');
      }
      console.log(`${width}px: Table/Board, lifecycle, explicit move, rollback, metadata, navigation and permissions passed`);
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log(`${checks} browser assertions passed. Screenshots: ${output}`);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
