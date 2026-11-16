import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPreflightReady } from './preflight-assertions.mjs';

const path = '/api/tasks/00000000-0000-0000-0000-000000000000/checklist-note-links';
const apiOrigin = 'https://www.actiproc.com';

function response(status = 204, overrides = {}) {
  return {
    status,
    headers: {
      'access-control-allow-origin': 'https://localhost',
      'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      vary: 'Origin',
      ...overrides,
    },
  };
}

function verify(result, method = 'GET') {
  return assertPreflightReady({
    response: result, method, path, apiOrigin,
    requiredHeaders: ['authorization', 'content-type'],
  });
}

test('accepts the exact Android origin and complete CORS contract', () => {
  assert.equal(verify(response()), undefined);
  assert.equal(verify(response(), 'DELETE'), undefined);
  assert.equal(verify(response(), 'POST'), undefined);
});

test('accepts mobile credentials CORS with POST and Content-Type', () => {
  assert.equal(assertPreflightReady({
    response: response(204, { 'access-control-allow-headers': 'Content-Type' }),
    path: '/api/mobile/auth/credentials', method: 'POST',
    apiOrigin, requiredHeaders: ['content-type'],
  }), undefined);
});

test('rejects stale Production middleware returning 401 for OPTIONS', () => {
  assert.throws(() => verify(response(401)), (error) => {
    assert.match(error.message, /OPTIONS request/);
    assert.match(error.message, /HTTP 401/);
    assert.match(error.message, /NEW Vercel Production deployment/);
    return true;
  });
});

test('rejects invalid origin and misconfigured CORS', () => {
  assert.throws(() => verify(response(403)), /MOBILE_AUTH_ALLOWED_ORIGINS/);
  assert.throws(() => verify(response(204, { 'access-control-allow-origin': '*' })), /allowed origin/);
  assert.throws(() => verify(response(204, { 'access-control-allow-origin': '' })), /allowed origin/);
});

test('rejects incomplete permission for requested method or headers', () => {
  assert.throws(() => verify(response(204, { 'access-control-allow-methods': 'GET, POST' }), 'DELETE'), /requested method/);
  assert.throws(() => verify(response(204, { 'access-control-allow-headers': 'content-type' })), /authorization/);
});

test('rejects preflight without correct Vary cache contract', () => {
  assert.throws(() => verify(response(204, { vary: 'Accept-Encoding' })), /Vary: Origin/);
});

test('rejects missing route, successful-looking 200, and runtime errors', () => {
  for (const status of [200, 404, 405, 500, 503]) {
    assert.throws(() => verify(response(status)), new RegExp(`HTTP ${status}`));
  }
});
