import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [gradle, twaManifestText, androidBuild, iosPromote, gitignore] = await Promise.all([
  readFile('twa-diagnostic/project/app/build.gradle', 'utf8'),
  readFile('twa-diagnostic/project/twa-manifest.json', 'utf8'),
  readFile('scripts/build-android-beta.ps1', 'utf8'),
  readFile('scripts/promote-ios-ipa.ps1', 'utf8'),
  readFile('.gitignore', 'utf8'),
]);
const twaManifest = JSON.parse(twaManifestText);

assert.match(gradle, /applicationId "com\.actiproc\.app"/);
assert.match(gradle, /versionCode [5-9]/);
assert.match(gradle, /versionName "1\.0\.[4-9]"/);
assert.equal(twaManifest.packageId, 'com.actiproc.app');
assert.ok(twaManifest.appVersionCode >= 5);
assert.match(twaManifest.appVersionName, /^1\.0\.[4-9]$/);
assert.match(androidBuild, /Read-Host 'Android keystore password \(input is hidden\)' -AsSecureString/);
assert.match(androidBuild, /84AADFBFCF2BF320DDC89D53E00E4D786DA09BD822F740A31609DFBC8E383CA8/);
assert.match(androidBuild, /versionCode is not greater than the installed beta version/);
assert.match(androidBuild, /Signing certificate changed; refusing promotion/);
assert.match(androidBuild, /\[switch\]\$CandidateOnly/);
assert.match(androidBuild, /Axiom-v1\.0\.4-test\.apk/);
assert.match(androidBuild, /dist\\android/);
assert.match(androidBuild, /Axiom\.apk/);
assert.doesNotMatch(androidBuild, /storePassword\s*=\s*['"][^'"]+['"]/i);
assert.match(iosPromote, /dist\\ios/);
assert.match(iosPromote, /Axiom-unsigned\.ipa/);
assert.match(gitignore, /\/dist\//);

console.log('Mobile release contract checks passed.');
