import https from 'node:https';
import { readFileSync } from 'node:fs';

const envFile = new URL('../.env.android-production-beta', import.meta.url);
const raw = readFileSync(envFile, 'utf8');
const match = /^VITE_AXIOM_API_ORIGIN=(.+)$/m.exec(raw);
if (!match) throw new Error('VITE_AXIOM_API_ORIGIN is missing from .env.android-production-beta.');

const origin = new URL(match[1].trim());
if (origin.protocol !== 'https:' || origin.origin !== 'https://getaxiomm.vercel.app') {
  throw new Error('Production beta must use the reviewed Axiom production HTTPS origin.');
}

function request(path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(path, origin), { method, headers }, (response) => {
      let body = '';
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error('Production mobile API timed out.')));
    req.on('error', reject);
    req.end();
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
  throw new Error(`Production credentials preflight is not ready (HTTP ${preflight.status ?? 'unknown'}).`);
}

const [session, googleStatus, assetLinks] = await Promise.all([
  request('/api/mobile/session'),
  request('/api/mobile/auth/google/status'),
  request('/.well-known/assetlinks.json'),
]);
if (session.status !== 401) throw new Error(`Session guard expected 401, received ${session.status ?? 'unknown'}.`);
if (googleStatus.status !== 200 || !JSON.parse(googleStatus.body)?.data?.enabled) {
  throw new Error('Production Google mobile authentication is not ready.');
}
if (assetLinks.status !== 200) throw new Error(`Production App Links are not ready (HTTP ${assetLinks.status ?? 'unknown'}).`);

console.log(`Verified production Android beta API: ${origin.origin}`);
