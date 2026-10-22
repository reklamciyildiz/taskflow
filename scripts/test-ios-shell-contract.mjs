import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [project, controller, oauth, entitlements, adapter, sessionRoute, middleware, packageJson, tailwind] = await Promise.all([
  read('ios/AxiomIOS/project.yml'),
  read('ios/AxiomIOS/Axiom/AxiomWebViewController.swift'),
  read('ios/AxiomIOS/Axiom/AxiomOAuthCoordinator.swift'),
  read('ios/AxiomIOS/Axiom/Axiom.entitlements'),
  read('lib/client/native-shell.ts'),
  read('app/api/mobile/auth/ios/web-session/route.ts'),
  read('middleware.ts'),
  read('package.json'),
  read('tailwind.config.ts'),
]);

assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER: com\.axiomproductivity\.ios/);
assert.match(controller, /https:\/\/getaxiomm\.vercel\.app/);
assert.doesNotMatch(controller, /server\.url|localhost|axiom-mobile-staging/);
assert.match(controller, /configuration\.websiteDataStore = \.default\(\)/);
assert.match(oauth, /ASWebAuthenticationSession/);
assert.match(oauth, /Callback\.https/);
assert.match(oauth, /code_challenge/);
assert.match(oauth, /SHA256/);
assert.match(entitlements, /applinks:getaxiomm\.vercel\.app/);
assert.match(entitlements, /webcredentials:getaxiomm\.vercel\.app/);
assert.match(adapter, /messageHandlers\?\.axiomAuth/);
assert.match(sessionRoute, /__Secure-next-auth\.session-token/);
assert.match(sessionRoute, /hashPkceVerifier/);
assert.match(sessionRoute, /assertMobileUserAllowed/);
assert.match(sessionRoute, /\.eq\('platform', 'ios'\)/);
assert.match(sessionRoute, /\.is\('consumed_at', null\)/);
assert.match(sessionRoute, /httpOnly: true/);
assert.match(sessionRoute, /secure: true/);
assert.match(sessionRoute, /sameSite: 'lax'/);
assert.match(sessionRoute, /value\.startsWith\('\/\/'\)/);
assert.match(middleware, /apple-app-site-association/);
assert.doesNotMatch(packageJson, /"mobile:build"/);
assert.doesNotMatch(tailwind, /mobile\/src/);

console.log('iOS shell contract checks passed.');
