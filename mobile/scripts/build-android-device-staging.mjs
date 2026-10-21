import { existsSync, mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const mobileRoot = process.cwd();
const debugRoot = join(mobileRoot, 'android', 'app', 'src', 'debug');
const localTrustFiles = [
  join(debugRoot, 'AndroidManifest.xml'),
  join(debugRoot, 'res', 'xml', 'axiom_debug_network_security.xml'),
  join(debugRoot, 'res', 'raw', 'axiom_local_ca.crt'),
].filter(existsSync);
const backupRoot = mkdtempSync(join(tmpdir(), 'axiom-device-staging-'));
const moved = [];

try {
  for (const source of localTrustFiles) {
    const destination = join(backupRoot, basename(source));
    renameSync(source, destination);
    moved.push({ source, destination });
  }

  const result = spawnSync(process.execPath, [join(mobileRoot, 'scripts', 'build-android-debug.mjs'), '--clean'], {
    cwd: mobileRoot,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  for (const { source, destination } of moved.reverse()) renameSync(destination, source);
}
