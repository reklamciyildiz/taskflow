// Fast, dependency-free guard against README drift, broken relative links,
// fabricated runtime versions and accidental auto-deployment instructions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readme = read('README.md');
const docsIndex = read('docs/README.md');
const pkg = JSON.parse(read('package.json'));
const mobile = JSON.parse(read('mobile/package.json'));
const vercel = JSON.parse(read('vercel.json'));
const template = read('.env.example');
let assertions = 0;

function check(value, message) {
  assert.ok(value, message);
  assertions++;
}

check(/^# Actiproc$/m.test(readme), 'README must introduce Actiproc by its current name');
check(!/^# Axiom/m.test(readme), 'Historical Axiom branding must not be the document title');
check(readme.length >= 5500 && readme.length < 20000, 'README should be useful without becoming an unmaintainable dump');
for (const heading of [
  '## Overview', '## Technology', '## Repository map', '## Local development',
  '## Verification', '## Release process', '## Security and operational boundaries',
  '## Documentation',
]) check(readme.includes(heading), 'Missing key README section: ' + heading);

check(pkg.dependencies.next.startsWith('^13.5.') && readme.includes('Next.js 13.5'),
  'Documented Next.js version no longer matches the lockstep package declaration');
check(pkg.dependencies.react.startsWith('18.') && readme.includes('React 18'),
  'Documented React version drift');
check(mobile.dependencies['@capacitor/core'].startsWith('8.') && readme.includes('Capacitor 8'),
  'Documented Capacitor major version drift');

check(vercel.git.deploymentEnabled === false, 'This documentation assumes manual Vercel deployments');
check(readme.includes('automatic deployments are disabled') && readme.includes('Vercel dashboard'),
  'Document controlled GitHub-to-Vercel release boundary');
check(!/npx\s+vercel\s+(deploy|link)/i.test(readme), 'Do not direct contributors to use local Vercel CLI');
check(readme.includes('GitHub merges never automatically') === false,
  'Do not duplicate a false migration statement in root README');
check(docsIndex.includes('GitHub merges never automatically install migrations'),
  'Docs index must state the SQL rollout boundary');

for (const term of ['MongoDB', 'Socket.IO', 'Next.js 15', 'React 19', 'Apple-level aesthetics']) {
  check(!readme.includes(term), 'Remove stale or invented README claim: ' + term);
}
for (const marker of [
  'supabase/migrations/', 'test:entitlements', 'test:creem',
  'scripts/test-marketing-locale-coverage.ts',
  'scripts/test-task-dependencies-ui.ts',
  'mobile/README.md', '20261116', 'Türkçe kısa özet',
]) check(readme.includes(marker), 'README missing important source-based guidance: ' + marker);

for (const name of [
  'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NEXT_PUBLIC_APP_URL',
]) {
  check(readme.includes(name), 'README missing environment guidance for ' + name);
  check(new RegExp('^' + name + '=', 'm').test(template),
    'Referenced environment key not found in .env.example: ' + name);
}

// Verify every local Markdown link works on case-sensitive CI filesystems.
for (const file of ['README.md', 'docs/README.md']) {
  const content = read(file);
  const basedir = path.dirname(path.join(root, file));
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const url = match[1];
    if (/^(https?:|mailto:|#)/.test(url)) continue;
    const relative = decodeURIComponent(url.split('#', 1)[0].split('?', 1)[0]);
    if (!relative) continue;
    const full = path.resolve(basedir, relative);
    check(full.startsWith(root + path.sep) && fs.existsSync(full),
      file + ' contains broken or escaping relative link: ' + url);
  }
}

for (const [command, scripts] of [
  ...[...readme.matchAll(/npm run ([\w:-]+)/g)].map(x => [x[1], pkg.scripts]),
  ...[...readme.matchAll(/npm --prefix mobile run ([\w:-]+)/g)].map(x => [x[1], mobile.scripts]),
]) check(Object.hasOwn(scripts, command), 'README references missing npm script: ' + command);

console.log(JSON.stringify({
  test: 'readme-contract',
  result: 'PASS',
  checks: assertions,
  validated: ['links', 'versions', 'scripts', 'env keys', 'release boundaries', 'product vocabulary'],
}));
