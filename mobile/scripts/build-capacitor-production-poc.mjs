import { copyFileSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mobileRoot = fileURLToPath(new URL('..', import.meta.url));
const productionOrigin = 'https://www.actiproc.com';
const diagnosticUrl = `${productionOrigin}/`;
const capacitorCli = join(mobileRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
const generatedConfig = join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json');
const env = {
  ...process.env,
  CAPACITOR_WEB_DIAGNOSTIC_URL: diagnosticUrl,
  ACTIPROC_CAPACITOR_PRODUCTION: 'true',
  AXIOM_CAPACITOR_PRODUCTION_POC: 'true',
  AXIOM_MOBILE_APP_LINK_HOST: 'www.actiproc.com',
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
  if (synced.appId !== 'com.actiproc.app.dev' || synced.server?.url !== diagnosticUrl) {
    throw new Error(`Capacitor POC sync did not produce expected appId (got ${synced.appId}) and HTTPS target (${synced.server?.url}).`);
  }
  run(process.execPath, [join(mobileRoot, 'scripts', 'build-android-debug.mjs'), '--clean']);

  const source = join(mobileRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (!existsSync(source)) throw new Error('Android Capacitor POC APK was not produced.');

  const distDirectory = join(mobileRoot, '..', 'dist', 'capacitor');
  const destination = join(distDirectory, 'Actiproc-Capacitor-Diagnostic-POC.apk');
  mkdirSync(distDirectory, { recursive: true });
  rmSync(destination, { force: true });
  copyFileSync(source, destination);

  const artifactDirectory = join(mobileRoot, 'artifacts', 'capacitor-poc');
  mkdirSync(artifactDirectory, { recursive: true });
  copyFileSync(source, join(artifactDirectory, 'Actiproc-Capacitor-Diagnostic-POC.apk'));

  console.log(`Capacitor Diagnostic POC APK: ${destination}`);
  console.log(`Remote Next.js target: ${diagnosticUrl}`);
  console.log('Diagnostic only: Capacitor server.url is not a production release architecture.');
} finally {
  // Restore the checked-in local-bundle configuration so a diagnostic run can
  // never silently convert later generic Android work into a remote build.
  const restoreEnv = { ...process.env };
  delete restoreEnv.CAPACITOR_WEB_DIAGNOSTIC_URL;
  delete restoreEnv.ACTIPROC_CAPACITOR_PRODUCTION;
  delete restoreEnv.AXIOM_CAPACITOR_PRODUCTION_POC;
  run(process.execPath, [capacitorCli, 'sync', 'android'], { env: restoreEnv });
}
