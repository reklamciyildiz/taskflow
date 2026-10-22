import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [
  googleStart,
  googleCallback,
  webSession,
  oauthCoordinator,
  aasa,
  project,
  twaManifest,
] = await Promise.all([
  read('app/api/mobile/auth/google/start/route.ts'),
  read('app/api/mobile/auth/google/callback/route.ts'),
  read('app/api/mobile/auth/ios/web-session/route.ts'),
  read('ios/AxiomIOS/Axiom/AxiomOAuthCoordinator.swift'),
  read('app/.well-known/apple-app-site-association/route.ts'),
  read('ios/AxiomIOS/project.yml'),
  read('twa-diagnostic/project/twa-manifest.json'),
]);

const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
assert.equal(challenge.length, 43, 'PKCE S256 challenge must be base64url SHA-256');

assert.match(googleStart, /platform.*=== 'ios'/);
assert.match(googleStart, /code_challenge/);
assert.match(googleStart, /nonce/);
assert.match(googleStart, /client_state/);
assert.match(googleStart, /mobileAuthEnabled\(\)/);

assert.match(googleCallback, /requireVerifiedGoogleIdentity\(payload\.sub, payload\.email\)/);
assert.match(googleCallback, /payload\.email_verified/);
assert.match(googleCallback, /secureEqual\(hashSecret\(payload\.nonce\), attempt\.nonce_hash\)/);
assert.match(googleCallback, /is\('consumed_at', null\)/);
assert.match(googleCallback, /assertMobileUserAllowed/);

assert.match(webSession, /eq\('platform', 'ios'\)/);
assert.match(webSession, /secureEqual\(String\(pendingCode\.code_challenge\), hashPkceVerifier\(verifier\)\)/);
assert.match(webSession, /AUTHORIZATION_CODE_REPLAYED/);
assert.match(webSession, /assertMobileUserAllowed/);
assert.match(webSession, /__Secure-next-auth\.session-token/);
assert.match(webSession, /httpOnly: true/);
assert.match(webSession, /secure: true/);
assert.match(webSession, /sameSite: 'lax'/);
assert.match(webSession, /value\.startsWith\('\/\/'\)/);
assert.doesNotMatch(webSession, /getByEmail|form\.get\('email'\)/);

assert.match(oauthCoordinator, /ASWebAuthenticationSession\.Callback\.https/);
assert.match(oauthCoordinator, /SHA256\.hash/);
assert.match(oauthCoordinator, /state == expectedState/);
assert.match(oauthCoordinator, /https:\/\/getaxiomm\.vercel\.app/);
assert.doesNotMatch(oauthCoordinator, /localhost|staging/);

assert.match(aasa, /process\.env\.APPLE_APP_TEAM_ID/);
assert.match(aasa, /\^\[A-Z0-9\]\{10\}\$/);
assert.match(aasa, /status: 404/);
assert.doesNotMatch(aasa, /TEAMID|ABCDE12345/);
assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER: com\.axiomproductivity\.ios/);

const twa = JSON.parse(twaManifest);
assert.equal(twa.host, 'getaxiomm.vercel.app');
assert.equal(twa.startUrl, '/');

console.log('iOS authentication and cross-platform backend security contracts passed.');
