/**
 * Strict CORS preflight contract for the Android production-beta build.
 * Keep this dependency-free so it can be tested without production secrets.
 */
const MOBILE_ORIGIN = 'https://localhost';

function header(headers, name) {
  const key = Object.keys(headers ?? {}).find((value) => value.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : undefined;
  return Array.isArray(value) ? value.join(',') : String(value ?? '');
}

function containsToken(value, token) {
  return value.split(',').some((part) => part.trim().toLowerCase() === token.toLowerCase());
}

function diagnosis(status) {
  if (status === 401) {
    return 'Production is rejecting an unauthenticated OPTIONS request before the Android CORS gate. The deployed middleware is likely older than main, or MOBILE_AUTH_ALLOWED_ORIGINS is missing https://localhost. A 401 for an invalid Bearer request is expected; a 401 for OPTIONS is NOT.';
  }
  if (status === 403) {
    return 'The Android WebView origin may not be approved in MOBILE_AUTH_ALLOWED_ORIGINS, or deployment protection is blocking this route.';
  }
  if (status === 404 || status === 405) {
    return 'This endpoint or its OPTIONS handler is missing from the active Production deployment.';
  }
  if (status != null && status >= 500) {
    return 'The deployed API is failing. Check the selected Vercel Production deployment and its function logs.';
  }
  return 'The deployed backend does not satisfy the strict Android CORS preflight contract.';
}

/**
 * Only the exact approved WebView origin and complete method/header grants
 * count as ready. An HTML/login response or permissive wildcard is not enough.
 */
export function assertPreflightReady({ response, path, method, requiredHeaders, apiOrigin }) {
  const status = response?.status;
  const headers = response?.headers ?? {};
  const actualOrigin = header(headers, 'access-control-allow-origin');
  const actualMethods = header(headers, 'access-control-allow-methods');
  const actualHeaders = header(headers, 'access-control-allow-headers');
  const vary = header(headers, 'vary');
  const problems = [];
  if (status !== 204) problems.push('status must be 204');
  if (actualOrigin !== MOBILE_ORIGIN) problems.push('allowed origin must equal https://localhost');
  if (!containsToken(actualMethods, method)) problems.push('requested method must be allowed');
  for (const name of requiredHeaders) {
    if (!containsToken(actualHeaders, name)) problems.push(`required header ${name} must be allowed`);
  }
  if (!containsToken(vary, 'origin')) problems.push('Vary: Origin must be present');
  if (problems.length === 0) return;

  throw new Error([
    `Production Android API preflight FAILED: ${method} ${path} (HTTP ${status ?? 'unknown'}).`,
    diagnosis(status),
    `Failed checks: ${problems.join('; ')}.`,
    `API origin: ${apiOrigin}. The APK build remains blocked deliberately.`,
    'Fix: deploy the latest main commit as a NEW Vercel Production deployment; make sure www.actiproc.com points at it and MOBILE_AUTH_ALLOWED_ORIGINS contains https://localhost. Redeploying an old deployment may reuse its old source. Then rerun npm --prefix mobile run verify:android-production-beta.',
  ].join('\n'));
}
