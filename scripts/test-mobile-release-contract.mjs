import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// AAB / signing checks now target the ONLY Android product: mobile/android (Capacitor).
const [gradle, capacitor, manifest, mobilePkg, gitignore] = await Promise.all([
  readFile('mobile/android/app/build.gradle','utf8'),
  readFile('mobile/capacitor.config.ts','utf8'),
  readFile('mobile/android/app/src/main/AndroidManifest.xml','utf8'),
  readFile('mobile/package.json','utf8'),
  readFile('.gitignore','utf8'),
]);
const pkg=JSON.parse(mobilePkg);
assert.match(gradle,/apply plugin: 'com.android.application'/);
assert.match(gradle,/applicationId "com.actiproc.app.dev"/);
assert.ok(capacitor.includes("appId: process.env.CAPACITOR_APP_ID"), 'Release package ID must be deliberately configured');
assert.ok(capacitor.includes("webDir: 'dist'"), 'Android release must bundle local web assets');
assert.ok(pkg.scripts['android:sync:production-beta'], 'Bundled production build required');
assert.ok(manifest.includes('android:autoVerify="true"'),'Capacitor OAuth Android App Links must survive');
assert.ok(!capacitor.includes("server: { url:"), 'Do not hard-code remote server URL in release');
assert.match(gitignore,/\/dist\//);
console.log('Capacitor Android release source contract passed; signed Play AAB still requires device and signing validation.');
