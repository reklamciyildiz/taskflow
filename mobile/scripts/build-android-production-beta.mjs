import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const mobileRoot = process.cwd();

const generatedCapacitorConfig = join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json');
const bundledIndex = join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html');

// Fail closed: production-beta MUST package the Vite UI instead of silently
// retaining a diagnostic server.url from an earlier cap sync.
if (!existsSync(generatedCapacitorConfig) || !existsSync(bundledIndex)) {
  throw new Error('Local Capacitor assets are missing. Run android:sync:production-beta first.');
}
const generatedConfig = JSON.parse(readFileSync(generatedCapacitorConfig, 'utf8'));
if (generatedConfig.server?.url) {
  throw new Error('Refusing Android beta build: server.url points to a remote website, not a bundled UI.');
}
const indexHtml = readFileSync(bundledIndex, 'utf8');
if (!indexHtml.includes('id="root"') || indexHtml.includes('Diagnostic shell')) {
  throw new Error('Refusing Android beta build: bundled UI is missing or still contains diagnostic placeholder assets.');
}
const debugRoot = join(mobileRoot, 'android', 'app', 'src', 'debug');
const localTrustFiles = [
  join(debugRoot, 'AndroidManifest.xml'),
  join(debugRoot, 'res', 'xml', 'axiom_debug_network_security.xml'),
  join(debugRoot, 'res', 'raw', 'axiom_local_ca.crt'),
].filter(existsSync);
const backupRoot = mkdtempSync(join(tmpdir(), 'axiom-production-beta-'));
const moved = [];

try {
  for (const source of localTrustFiles) {
    const destination = join(backupRoot, basename(source));
    renameSync(source, destination);
    moved.push({ source, destination });
  }

  const result = spawnSync(process.execPath, [join(mobileRoot, 'scripts', 'build-android-debug.mjs'), '--clean'], {
    cwd: mobileRoot,
    env: { ...process.env, AXIOM_MOBILE_APP_LINK_HOST: 'www.actiproc.com' },
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    const sourceApk = join(mobileRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    const artifactDirectory = join(mobileRoot, 'artifacts');
    if (!existsSync(sourceApk)) throw new Error(`Android debug APK was not produced: ${sourceApk}`);
    mkdirSync(artifactDirectory, { recursive: true });
    copyFileSync(sourceApk, join(artifactDirectory, 'axiom-production-beta-debug.apk'));
  }
} finally {
  for (const { source, destination } of moved.reverse()) renameSync(destination, source);
}
