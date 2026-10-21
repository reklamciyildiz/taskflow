import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const mobileRoot = process.cwd();
const stagingOrigin = 'https://axiom-mobile-staging.vercel.app';
const diagnosticUrl = `${stagingOrigin}/`;
const env = {
  ...process.env,
  CAPACITOR_WEB_DIAGNOSTIC_URL: diagnosticUrl,
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: mobileRoot,
    env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// This intentionally packages no alternate product UI. Capacitor opens the real
// staging Next.js app so SSR, NextAuth, App Router and streaming can be diagnosed.
run(process.execPath, [join(mobileRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'sync', 'android']);
run(process.execPath, [join(mobileRoot, 'scripts', 'build-android-debug.mjs'), '--clean']);

const source = join(mobileRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(source)) throw new Error('Android diagnostic APK was not produced.');

const artifactDirectory = join(mobileRoot, 'artifacts');
const destination = join(artifactDirectory, 'axiom-web-diagnostic-debug.apk');
mkdirSync(artifactDirectory, { recursive: true });
rmSync(destination, { force: true });
copyFileSync(source, destination);

console.log(`Web diagnostic APK: ${destination}`);
console.log(`Remote Next.js target: ${diagnosticUrl}`);
