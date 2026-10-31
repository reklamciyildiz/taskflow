import https from 'node:https';
import { readFileSync } from 'node:fs';

const envFile = new URL('../.env.android-production-beta', import.meta.url);
const raw = readFileSync(envFile, 'utf8');
const match = /^VITE_AXIOM_API_ORIGIN=(.+)$/m.exec(raw);
if (!match) throw new Error('VITE_AXIOM_API_ORIGIN is missing from .env.android-production-beta.');

const origin = new URL(match[1].trim());
const allowedOrigins = ['https://www.actiproc.com', 'https://actiproc.com', 'https://getaxiomm.vercel.app'];
if (origin.protocol !== 'https:' || !allowedOrigins.includes(origin.origin)) {
  throw new Error('Production beta must use the reviewed Actiproc production HTTPS origin.');
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

const sharedApiPaths = [
  { path: '/api/knowledge?teamId=00000000-0000-0000-0000-000000000000', method: 'GET' },
  { path: '/api/ai/conversations', method: 'GET' },
  { path: '/api/tasks/00000000-0000-0000-0000-000000000000/notes', method: 'GET' },
  { path: '/api/notes/00000000-0000-0000-0000-000000000000', method: 'PATCH' },
  { path: '/api/attachments?taskId=00000000-0000-0000-0000-000000000000', method: 'GET' },
  { path: '/api/attachments/00000000-0000-0000-0000-000000000000', method: 'GET' },
];
for (const { path, method } of sharedApiPaths) {
  const sharedPreflight = await request(path, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://localhost',
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  });
  if (
    sharedPreflight.status !== 204
    || sharedPreflight.headers['access-control-allow-origin'] !== 'https://localhost'
  ) {
    throw new Error(`Shared mobile API preflight is not ready for ${method} ${path} (HTTP ${sharedPreflight.status ?? 'unknown'}).`);
  }

  const rejected = await request(path, {
    method,
    headers: {
      Origin: 'https://localhost',
      Authorization: 'Bearer invalid-production-beta-smoke-token',
      ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  // The fake file ID may return 404 before the newest API deployment reaches
  // every edge; this is still a fail-closed result, never a data disclosure.
  // The list endpoint above must reject an invalid Bearer with 401.
  const expectedStatuses = path.startsWith('/api/attachments/') ? [401, 404] : [401];
  if (
    !expectedStatuses.includes(rejected.status ?? -1)
    || rejected.headers['access-control-allow-origin'] !== 'https://localhost'
  ) {
    throw new Error(`Shared mobile API did not fail closed for ${method} ${path} (HTTP ${rejected.status ?? 'unknown'}).`);
  }
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
