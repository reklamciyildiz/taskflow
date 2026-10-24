import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const device = await readFile('.github/workflows/ios-device-ipa.yml', 'utf8');
const simulator = await readFile('.github/workflows/ios-simulator-build.yml', 'utf8');

assert.match(device, /^on:\r?\n  workflow_dispatch:\s*$/m);
assert.doesNotMatch(device, /^\s+(push|pull_request|schedule):/m);
assert.match(device, /runs-on: macos-26/);
assert.match(device, /-sdk iphoneos/);
assert.match(device, /generic\/platform=iOS/);
assert.match(device, /CODE_SIGNING_ALLOWED=NO/);
assert.match(device, /CODE_SIGNING_REQUIRED=NO/);
assert.match(device, /lipo -archs/);
assert.match(device, /arm64/);
assert.match(device, /embedded\.mobileprovision/);
assert.match(device, /codesign --verify --deep --strict/);
assert.match(device, /Payload\/Axiom\.app/);
assert.match(device, /Axiom-unsigned\.ipa/);
assert.match(device, /UILaunchScreen:UIColorName/);
assert.match(device, /UILaunchScreen:UIImageName/);
assert.match(device, /UIDeviceFamily/);
assert.match(device, /compiled-info-plist\.txt/);
assert.match(device, /requested-entitlements\.plist/);
assert.match(device, /retention-days: 7/);
assert.doesNotMatch(device, /APP_STORE_CONNECT|API_KEY|PRIVATE_KEY|CERTIFICATE_BASE64|PROVISIONING_PROFILE_BASE64/);
assert.match(simulator, /name: iOS Simulator Build/);
assert.match(simulator, /-sdk iphonesimulator/);

console.log('iOS unsigned device IPA workflow contract checks passed.');
