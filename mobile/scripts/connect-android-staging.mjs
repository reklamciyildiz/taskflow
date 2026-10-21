import net from 'node:net';
import http from 'node:http';
import { accessSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const isWindows = process.platform === 'win32';
const executable = isWindows ? 'adb.exe' : 'adb';
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const candidates = [
  process.env.AXIOM_ADB_PATH,
  sdkRoot && path.join(sdkRoot, 'platform-tools', executable),
  // Local Windows SDK fallback used by the checked development environment.
  isWindows ? 'C:\\Android\\Sdk\\platform-tools.backup\\adb.exe' : null,
  executable,
].filter(Boolean);

function resolveAdb() {
  for (const candidate of candidates) {
    try {
      if (candidate === executable) {
        return { path: candidate, devices: execFileSync(candidate, ['devices'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) };
      } else {
        accessSync(candidate, constants.X_OK);
        return { path: candidate, devices: execFileSync(candidate, ['devices'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) };
      }
    } catch {
      // Try the next explicit candidate.
    }
  }
  throw new Error('ADB was not found. Set AXIOM_ADB_PATH or ANDROID_HOME, then retry.');
}

function waitForPort(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const fail = () => reject(new Error(`Local port ${port} is not listening.`));
    socket.setTimeout(2_000, fail);
    socket.once('error', fail);
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
  });
}

function verifyCredentialsPreflight() {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: 3200,
      path: '/api/mobile/auth/credentials',
      method: 'OPTIONS',
      headers: {
        Origin: 'https://localhost',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    }, (response) => {
      response.resume();
      const allowedOrigin = response.headers['access-control-allow-origin'];
      if (response.statusCode !== 204 || allowedOrigin !== 'https://localhost') {
        reject(new Error(`Mobile auth preflight is unhealthy (HTTP ${response.statusCode ?? 'unknown'}).`));
        return;
      }
      resolve();
    });
    request.setTimeout(5_000, () => request.destroy(new Error('Mobile auth preflight timed out.')));
    request.on('error', reject);
    request.end();
  });
}

const resolvedAdb = resolveAdb();
const adb = resolvedAdb.path;
try {
  await Promise.all([waitForPort(3200), waitForPort(3443)]);
  await verifyCredentialsPreflight();
} catch (error) {
  console.error(error.message);
  console.error('Restart `npm run dev:staging:mobile` and `node .local-android-user/https-proxy.mjs` from the repository root.');
  process.exit(1);
}

const devices = resolvedAdb.devices;
if (!/^\S+\s+device$/m.test(devices)) {
  throw new Error('No ready Android emulator/device was found. Start Axiom_API_36 first.');
}

execFileSync(adb, ['reverse', 'tcp:3443', 'tcp:3443'], { stdio: 'inherit' });
const reverseList = execFileSync(adb, ['reverse', '--list'], { encoding: 'utf8' });
if (!/tcp:3443\s+tcp:3443/.test(reverseList)) {
  throw new Error('ADB reverse did not persist. Reconnect the emulator and retry.');
}

console.log('Android staging bridge ready: emulator https://localhost:3443 -> host https://localhost:3443');
console.log('Run this command again after every emulator restart.');
