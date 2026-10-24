import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/ios-simulator-build.yml', 'utf8');
const project = await readFile('ios/AxiomIOS/project.yml', 'utf8');

assert.match(workflow, /^on:\r?\n  workflow_dispatch:\s*$/m);
assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
assert.match(workflow, /runs-on: macos-26/);
assert.match(workflow, /XCODE_MAJOR.*-lt 26/);
assert.match(workflow, /xcodegen generate --spec project\.yml/);
assert.match(workflow, /CODE_SIGNING_ALLOWED=NO/);
assert.match(workflow, /-sdk iphonesimulator/);
assert.match(workflow, /xcrun simctl launch/);
assert.match(workflow, /xcrun simctl io.*screenshot/);
assert.match(workflow, /UILaunchScreen:UIColorName/);
assert.match(workflow, /UILaunchScreen:UIImageName/);
assert.match(workflow, /UIDeviceFamily/);
assert.match(workflow, /DEVICE_TYPE_LIST/);
assert.match(workflow, /axiom-\$\{LABEL\}\.png/);
assert.match(workflow, /compiled-info-plist\.txt/);
assert.match(workflow, /Axiom-Simulator\.app\.zip/);
assert.match(workflow, /AxiomBuild\.xcresult/);
assert.match(workflow, /retention-days: 7/);
assert.doesNotMatch(workflow, /\$\{\{ runner\.temp \}\}/);
assert.doesNotMatch(workflow, /APP_STORE|API_KEY|PRIVATE_KEY|PROVISIONING|CERTIFICATE/);
assert.match(project, /^schemes:\r?\n  Axiom:/m);

console.log('iOS GitHub Actions workflow contract checks passed.');
