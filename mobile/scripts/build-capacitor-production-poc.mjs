import { copyFileSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const mobileRoot = process.cwd();
const productionOrigin = 'https://getaxiomm.vercel.app';
const diagnosticUrl = `${productionOrigin}/`;
const capacitorCli = join(mobileRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
const generatedConfig = join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json');
const env = {
  ...process.env,
  CAPACITOR_WEB_DIAGNOSTIC_URL: diagnosticUrl,
  AXIOM_CAPACITOR_PRODUCTION_POC: 'true',
  AXIOM_MOBILE_APP_LINK_HOST: 'getaxiomm.vercel.app',
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: mobileRoot,
    env: options.env ?? env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
}

// Diagnostic only: no Vite/React mobile UI is built. Capacitor opens the real
// production Next.js application so SSR, App Router, Tailwind, NextAuth and SSE
// behavior can be measured without copying any product screen.
try {
  run(process.execPath, [capacitorCli, 'sync', 'android']);
  const synced = JSON.parse(readFileSync(generatedConfig, 'utf8'));
  if (synced.appId !== 'com.axiomproductivity.mobile.dev' || synced.server?.url !== diagnosticUrl) {
    throw new Error('Capacitor POC sync did not produce the expected isolated app identity and HTTPS target.');
  }
  run(process.execPath, [join(mobileRoot, 'scripts', 'build-android-debug.mjs'), '--clean']);

  const source = join(mobileRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!existsSync(source)) throw new Error('Android Capacitor POC APK was not produced.');

  const artifactDirectory = join(mobileRoot, 'artifacts', 'capacitor-poc');
  const destination = join(artifactDirectory, 'Axiom-Capacitor-POC-debug.apk');
  mkdirSync(artifactDirectory, { recursive: true });
  rmSync(destination, { force: true });
  copyFileSync(source, destination);
  console.log(`Capacitor POC APK: ${destination}`);
  console.log(`Remote Next.js target: ${diagnosticUrl}`);
  console.log('Diagnostic only: Capacitor server.url is not a production release architecture.');
} finally {
  // Restore the checked-in local-bundle configuration so a diagnostic run can
  // never silently convert later generic Android work into a remote build.
  const restoreEnv = { ...process.env };
  delete restoreEnv.CAPACITOR_WEB_DIAGNOSTIC_URL;
  delete restoreEnv.AXIOM_CAPACITOR_PRODUCTION_POC;
  run(process.execPath, [capacitorCli, 'sync', 'android'], { env: restoreEnv });
}
