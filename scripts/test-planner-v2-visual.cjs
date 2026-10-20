const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const esbuild = require('esbuild');

async function runChrome(chrome, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr || `Chrome exited with ${code}`)));
  });
}

async function main() {
  const root = process.cwd();
  const output = path.join(root, '.next', 'planner-v2-visual');
  fs.mkdirSync(output, { recursive: true });
  const fixture = path.join(root, 'scripts', 'fixtures', 'planner-v2-visual.tsx');
  await esbuild.build({
    entryPoints: [fixture], outfile: path.join(output, 'fixture.js'), bundle: true, platform: 'browser',
    jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'task-context-fixture', setup(build) {
      build.onResolve({ filter: /^@\/components\/TaskContext$/ }, () => ({ path: fixture }));
    } }],
  });
  const css = fs.readdirSync(path.join(root, '.next', 'static', 'css'))
    .map(name => path.join(root, '.next', 'static', 'css', name));
  let resolveProbe;
  const probeResult = new Promise((resolve, reject) => {
    resolveProbe = resolve;
    setTimeout(() => reject(new Error('Calendar browser interaction probe timed out.')), 10000);
  });
  const server = http.createServer((request, response) => {
    if (request.url === '/__visual-result' && request.method === 'POST') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        resolveProbe(JSON.parse(body));
        response.end('ok');
      });
      return;
    }
    if (request.url === '/fixture.js') {
      response.setHeader('Content-Type', 'text/javascript');
      return response.end(fs.readFileSync(path.join(output, 'fixture.js')));
    }
    if (request.url?.startsWith('/styles/')) {
      response.setHeader('Content-Type', 'text/css');
      return response.end(fs.readFileSync(css[Number(path.basename(request.url))]));
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<html><head>${css.map((_, i) => `<link rel="stylesheet" href="/styles/${i}">`).join('')}</head><body><div id="root"></div><script>window.addEventListener('error',event=>document.getElementById('root').textContent=event.error?.stack||event.message);window.addEventListener('unhandledrejection',event=>document.getElementById('root').textContent=event.reason?.stack||String(event.reason));</script><script src="/fixture.js"></script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'chromium_headless_shell-1208', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
  const cases = [
    ['mobile-360-dark-today', 360, 800, 'dark', 'today'],
    ['mobile-360-dark-calendar', 360, 800, 'dark', 'calendar'],
    ['mobile-390-light-calendar', 390, 844, 'light', 'calendar'],
    ['mobile-430-dark-routines', 430, 900, 'dark', 'routines'],
    ['mobile-430-dark-calendar', 430, 900, 'dark', 'calendar'],
    ['tablet-768-light-calendar', 768, 1024, 'light', 'calendar'],
    ['desktop-1440-dark-calendar', 1440, 1000, 'dark', 'calendar'],
    ['desktop-1440-dark-routines', 1440, 1000, 'dark', 'routines'],
    ['desktop-1440-light-today', 1440, 1000, 'light', 'today'],
  ];
  try {
    await runChrome(chrome, [
      '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=3500', '--dump-dom',
      `http://127.0.0.1:${port}/?theme=dark&view=calendar&probe=1`,
    ]);
    const interactions = await probeResult;
    if (Object.values(interactions).some(value => value !== true)) {
      throw new Error(`Calendar interaction probe failed: ${JSON.stringify(interactions)}`);
    }
    for (const [name, width, height, theme, view] of cases) {
      const screenshot = path.join(output, `${name}.png`);
      await runChrome(chrome, [
        '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--virtual-time-budget=2500',
        `--window-size=${width},${height}`, `--screenshot=${screenshot}`,
        `http://127.0.0.1:${port}/?theme=${theme}&view=${view}`,
      ]);
    }
    console.log(JSON.stringify({ interactions, screenshots: cases.map(([name]) => path.join(output, `${name}.png`)) }, null, 2));
  } finally {
    server.close();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
