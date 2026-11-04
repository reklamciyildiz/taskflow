// Isolated real-Chromium UI regression tests for Actiproc AI.
// No production accounts, live provider calls, or Supabase access.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('tailwindcss');

async function main() {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'actiproc-ai-ui-'));
  await esbuild.build({
    entryPoints: ['scripts/fixtures/ai-premium.tsx'],
    outfile: path.join(output, 'app.js'),
    bundle: true, platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{
      name: 'ai-ui-isolation',
      setup(build) {
        build.onResolve({ filter: /^@\/components\/TaskContext$/ },
          () => ({ path: 'task-context', namespace: 'fixture-stubs' }));
        build.onResolve({ filter: /^next\/navigation$/ },
          () => ({ path: 'next-navigation', namespace: 'fixture-stubs' }));
        build.onLoad({ filter: /.*/, namespace: 'fixture-stubs' }, (args) => ({
          contents: args.path === 'task-context'
            ? 'export function useTaskContext(){ return { openTaskEditor() {}, refreshData: async()=>{} }; }'
            : 'export function useSearchParams(){ return new URLSearchParams(); }',
          loader: 'js',
        }));
      },
    }],
  });
  const css = await postcss([tailwind('./tailwind.config.ts')])
    .process(fs.readFileSync('app/globals.css', 'utf8'), { from: 'app/globals.css' });
  fs.writeFileSync(path.join(output, 'app.css'), css.css);
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js' || req.url === '/app.css') {
      res.writeHead(200, { 'Content-Type': req.url.endsWith('css') ? 'text/css' : 'text/javascript' });
      res.end(fs.readFileSync(path.join(output, req.url.slice(1))));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html lang="en" class="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = require(path.resolve(process.argv[2]));
  const browser = await chromium.launch({
    executablePath: path.resolve(process.argv[3]),
    headless: true,
  });

  let checks = 0;
  const errors = [];
  const sse = (event) => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n';
  try {
    for (const width of [320, 390, 768, 1024, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 768 });
      page.on('pageerror', error => errors.push(error.stack || error.message));
      const now = new Date().toISOString();
      const conversations = [
        { id: 'old-1', title: 'Planning decisions', context: { origin: 'global' }, createdAt: now, updatedAt: now, lastMessageAt: now },
        { id: 'old-2', title: 'Ideas for onboarding', context: { origin: 'global' }, createdAt: now, updatedAt: now, lastMessageAt: now },
      ];
      const conversationMessages = {
        'old-1': [{ id: 'old-message', role: 'assistant', content: 'Existing conversation content', status: 'completed', model: null, createdAt: now, sources: [] }],
      };
      let incomingMessages = 0;
      await page.route('**/api/ai/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        const parts = url.pathname.split('/');
        if (url.pathname === '/api/ai/usage') {
          await route.fulfill({ json: {
            plan: 'team', access: 'available', period: 'calendar_month_utc', includedSeats: 3,
            daily: { used: 3, limit: 150, remaining: 147 },
            monthly: { used: 40, limit: 1200, remaining: 1160 },
            asOf: new Date().toISOString(),
          } });
          return;
        }
        if (url.pathname === '/api/ai/conversations' && method === 'GET') {
          await route.fulfill({ json: { conversations } }); return;
        }
        if (url.pathname === '/api/ai/conversations' && method === 'POST') {
          const id = 'new-' + (++incomingMessages);
          conversations.unshift({ id, title: 'New conversation', context: { origin: 'global' }, createdAt: now, updatedAt: now, lastMessageAt: now });
          await route.fulfill({ json: { conversation: { id } } }); return;
        }
        if (parts.length === 5 && parts[3] === 'conversations') {
          const id = parts[4];
          const item = conversations.find(chat => chat.id === id);
          if (!item) { await route.fulfill({ status: 404, json: { error: 'Missing conversation' } }); return; }
          if (method === 'GET') {
            await route.fulfill({ json: { messages: conversationMessages[id] || [] } }); return;
          }
          if (method === 'PATCH') {
            item.title = request.postDataJSON().title;
            await route.fulfill({ json: { conversation: item } }); return;
          }
          if (method === 'DELETE') {
            conversations.splice(conversations.indexOf(item), 1);
            await route.fulfill({ json: { success: true } }); return;
          }
        }
        if (url.pathname === '/api/ai/chat' && method === 'POST') {
          const requestBody = request.postDataJSON();
          assert.equal(typeof requestBody.message, 'string');
          assert.ok(requestBody.clientRequestId);
          const cited = 'a'.repeat(64);
          const body = [
            sse({ type: 'meta', conversationId: requestBody.conversationId,
              userMessageId: 'user-real', assistantMessageId: 'assistant-real' }),
            sse({ type: 'tool_status', label: 'Checking accessible workspace records' }),
            sse({ type: 'delta', text: '## Summary\n\n- Action A is in progress.\n- Action B is done.\n\n' }),
            sse({ type: 'delta', text: 'Here is a **verified reference** [cite:' + cited + '].' }),
            sse({ type: 'sources', sources: [{
              citationId: cited, title: 'Source Action', snippet: 'Accessible Action description',
              navigation: { actionId: 'action-a' },
            }] }),
            sse({ type: 'done', finishReason: 'completed' }),
          ].join('');
          await route.fulfill({
            status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' },
            body,
          });
          return;
        }
        await route.fulfill({ status: 404, json: { error: 'Unexpected mocked route: ' + url.pathname } });
      });
      await page.goto('http://127.0.0.1:' + server.address().port);
      const checkLayout = async (label) => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, width + 'px ' + label + ': document overflow');
        const bounds = await page.locator('.axiom-ai-chat').boundingBox();
        assert.ok(bounds && bounds.width <= width + 1, width + 'px ' + label + ': shell overflow');
        checks += 2;
      };
      await page.getByRole('heading', { name: 'Work, clarified.' }).waitFor();
      await checkLayout('welcome');
      await page.getByRole('button', { name: 'AI usage and access' }).click();
      await page.getByText('Monthly requests').waitFor();
      await page.getByText('Daily requests').waitFor();
      assert.equal(await page.getByRole('progressbar', { name: 'Monthly AI requests used' }).getAttribute('aria-valuemax'), '1200');
      checks++;
      await page.keyboard.press('Escape');

      // Responsive history: overlay on phones/tablets, persistent on desktop.
      if (width < 1024) {
        await page.getByRole('button', { name: 'Open conversation history' }).click();
        await page.getByRole('textbox', { name: 'Search conversations' }).fill('Planning');
        await page.getByRole('button', { name: /^Planning decisions/ }).waitFor();
        assert.equal(await page.getByRole('button', { name: /^Ideas for onboarding/ }).count(), 0);
        await page.getByRole('textbox', { name: 'Search conversations' }).fill('');
        await page.getByRole('button', { name: /^Planning decisions/ }).click();
      } else {
        await page.getByRole('textbox', { name: 'Search conversations' }).fill('Planning');
        await page.getByRole('button', { name: /^Planning decisions/ }).waitFor();
        assert.equal(await page.getByRole('button', { name: /^Ideas for onboarding/ }).count(), 0);
        await page.getByRole('textbox', { name: 'Search conversations' }).fill('');
        await page.getByRole('button', { name: /^Planning decisions/ }).click();
      }
      await page.getByText('Existing conversation content').waitFor();
      checks += 3;
      await checkLayout('history selection');

      // Create a new chat and exercise the streamed answer, rich layout, sources and copy.
      const newButton = width < 1024
        ? page.getByRole('button', { name: 'New conversation' }).last()
        : page.getByRole('button', { name: 'New conversation' }).first();
      await newButton.click();
      await page.getByRole('heading', { name: 'Work, clarified.' }).waitFor();
      await page.getByRole('button', { name: /Summarize my work/ }).click();
      await page.getByText('Here is a').waitFor();
      await page.getByRole('heading', { name: 'Summary' }).waitFor();
      await page.getByRole('button', { name: /Source Action/ }).click();
      assert.deepEqual(await page.evaluate(() => window.qa.opened), ['action-a']);
      checks += 3;
      await checkLayout('stream and sources');

      // Mobile/desktop composer must remain usable after a long answer.
      await page.getByRole('textbox', { name: 'Message Actiproc AI' }).fill('Help me plan tomorrow');
      await page.getByRole('button', { name: 'Send message' }).click();
      await page.getByText('Help me plan tomorrow').waitFor();
      checks++;
      await checkLayout('composer');
      if (width === 1440) {
        await page.getByRole('button', { name: 'More options for New conversation', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Rename' }).click();
        await page.getByRole('textbox', { name: 'Edit conversation title' }).fill('Renamed workspace chat');
        await page.getByRole('button', { name: 'Save conversation title' }).click();
        await page.getByRole('button', { name: /^Renamed workspace chat/ }).waitFor();
        checks++;
        await page.getByRole('button', { name: 'More options for Renamed workspace chat', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Delete' }).click();
        await page.getByRole('button', { name: 'Delete conversation', exact: true }).click();
        await page.getByRole('heading', { name: 'Work, clarified.' }).waitFor();
        assert.equal(await page.getByRole('button', { name: /^Renamed workspace chat/ }).count(), 0);
        checks++;
      }
      await page.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ aiPremiumBrowserChecks: checks, widths: [320, 390, 768, 1024, 1440], errors }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(output, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
