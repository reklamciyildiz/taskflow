import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [
  plugin,
  secureSessionPlugin,
  mainActivity,
  manifest,
  nativeAdapter,
  startRoute,
  callbackRoute,
  sessionRoute,
  sharedSession,
] = await Promise.all([
  read('mobile/android/app/src/main/java/com/axiomproductivity/mobile/dev/AxiomAuthPlugin.java'),
  read('mobile/android/app/src/main/java/com/axiomproductivity/mobile/dev/SecureSessionPlugin.java'),
  read('mobile/android/app/src/main/java/com/axiomproductivity/mobile/dev/MainActivity.java'),
  read('mobile/android/app/src/main/AndroidManifest.xml'),
  read('lib/client/native-shell.ts'),
  read('app/api/mobile/auth/google/start/route.ts'),
  read('app/api/mobile/auth/google/callback/route.ts'),
  read('app/api/mobile/auth/web-session/route.ts'),
  read('lib/mobile-auth/web-session.ts'),
]);

const verifier = randomBytes(64).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
assert.equal(challenge.length, 43);

assert.match(mainActivity, /registerPlugin\(AxiomAuthPlugin\.class\)/);
assert.match(manifest, /android:scheme="https"/);
assert.match(manifest, /android:pathPrefix="\/mobile\/auth\/callback"/);
assert.match(plugin, /@CapacitorPlugin\(name = "AxiomAuth"\)/);
assert.match(plugin, /new SecureRandom\(\)/);
assert.match(plugin, /MessageDigest\.getInstance\("SHA-256"\)/);
assert.match(plugin, /MessageDigest\.isEqual/);
assert.match(plugin, /Intent\.ACTION_VIEW/);
assert.match(plugin, /CATEGORY_BROWSABLE/);
assert.match(plugin, /"platform", "android"/);
assert.match(plugin, /CALLBACK_PATH = "\/mobile\/auth\/callback"/);
assert.match(plugin, /bridge\.getWebView\(\)\.postUrl/);
assert.match(plugin, /SESSION_PATH = "\/api\/mobile\/auth\/web-session"/);
assert.match(plugin, /clearPendingAuth\(\);[\s\S]*String body/);
assert.doesNotMatch(plugin, /addJavascriptInterface|Log\.|System\.out|localStorage/);
assert.match(plugin, /nativeOauthVerifierV1/);
assert.doesNotMatch(secureSessionPlugin, /nativeOauthVerifierV1|nativeOauthStateV1|nativeOauthCallbackPathV1/);

assert.match(nativeAdapter, /getPlatform\?\.\(\) === 'android'/);
assert.match(nativeAdapter, /Plugins\?\.AxiomAuth/);
assert.match(nativeAdapter, /androidAuth\.startGoogleSignIn/);
assert.match(startRoute, /code_challenge/);
assert.match(startRoute, /nonce/);
assert.match(startRoute, /client_state/);
assert.match(callbackRoute, /requireVerifiedGoogleIdentity\(payload\.sub, payload\.email\)/);
assert.match(callbackRoute, /payload\.email_verified/);
assert.match(callbackRoute, /is\('consumed_at', null\)/);
assert.match(callbackRoute, /Date\.now\(\) \+ 2 \* 60_000/);
assert.match(sessionRoute, /createMobileWebSession\(request\)/);
assert.match(sharedSession, /requestedPlatform/);
assert.match(sharedSession, /secureEqual\(String\(pendingCode\.code_challenge\), hashPkceVerifier\(verifier\)\)/);
assert.match(sharedSession, /\.gt\('expires_at', now\)/);
assert.match(sharedSession, /\.is\('consumed_at', null\)/);
assert.match(sharedSession, /AUTHORIZATION_CODE_REPLAYED/);
assert.match(sharedSession, /assertMobileUserAllowed/);
assert.match(sharedSession, /encode\(/);
assert.match(sharedSession, /__Secure-next-auth\.session-token/);
assert.match(sharedSession, /httpOnly: true/);
assert.match(sharedSession, /secure: true/);
assert.match(sharedSession, /sameSite: 'lax'/);
assert.match(sharedSession, /request\.nextUrl\.origin !== canonicalOrigin/);
assert.match(sharedSession, /value\.length > 2048/);
assert.doesNotMatch(sharedSession, /getByEmail|form\.get\('email'\)|accessToken/);

console.log('Capacitor OAuth and NextAuth WebView session handoff contracts passed.');
