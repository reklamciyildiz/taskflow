import https from 'node:https';
import { readFileSync } from 'node:fs';

const envFile = new URL('../.env.android-device-staging', import.meta.url);
const raw = readFileSync(envFile, 'utf8');
const match = /^VITE_AXIOM_API_ORIGIN=(.+)$/m.exec(raw);
if (!match) throw new Error('VITE_AXIOM_API_ORIGIN is missing from .env.android-device-staging.');

const origin = new URL(match[1].trim());
if (origin.protocol !== 'https:' || origin.hostname === 'localhost' || origin.hostname === '127.0.0.1') {
  throw new Error('Android device staging requires a public HTTPS origin, never localhost.');
}

function request(path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(new URL(path, origin), { method, headers }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Public staging API timed out.')));
    request.on('error', reject);
    request.end();
  });
}

const preflight = await request('/api/mobile/auth/credentials', {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://localhost',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type',
  },
});
if (preflight.status !== 204 || preflight.headers['access-control-allow-origin'] !== 'https://localhost') {
  throw new Error(`Public staging credentials preflight is not ready (HTTP ${preflight.status ?? 'unknown'}).`);
}

const session = await request('/api/mobile/session');
if (session.status !== 401) {
  throw new Error(`Public staging mobile session guard is not ready (expected 401, received ${session.status ?? 'unknown'}).`);
}

console.log(`Verified public Android staging API: ${origin.origin}`);
