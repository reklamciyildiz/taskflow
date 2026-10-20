import type { MobileSessionTokens, MobileWorkspace } from '../../shared/mobile-contracts';
import { Browser } from '@capacitor/browser';
import { secureSession } from './secure-session';

const apiBase = (import.meta.env.VITE_AXIOM_API_ORIGIN ?? '').replace(/\/$/, '');
let accessToken: string | null = null;

function endpoint(path: string) {
  if (!apiBase) throw new Error('Mobile API environment is not configured.');
  return `${apiBase}${path}`;
}

export async function ensureDeviceId(): Promise<string> {
  const existing = await secureSession.get('deviceId');
  if (existing) return existing;
  const created = crypto.randomUUID();
  await secureSession.set('deviceId', created);
  return created;
}

async function acceptTokens(tokens: MobileSessionTokens) {
  accessToken = tokens.accessToken;
  await secureSession.set('refreshToken', tokens.refreshToken);
  return tokens;
}

async function parse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
  return payload.data as T;
}

export async function credentialsSignIn(email: string, password: string) {
  const response = await fetch(endpoint('/api/mobile/auth/credentials'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, platform: 'android', deviceId: await ensureDeviceId() }),
  });
  return acceptTokens(await parse<MobileSessionTokens>(response));
}

function randomBase64Url(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startGoogleSignIn() {
  const verifier = randomBase64Url(48);
  const state = randomBase64Url(32);
  await Promise.all([secureSession.set('oauthVerifier', verifier), secureSession.set('oauthState', state)]);
  const challenge = await sha256Base64Url(verifier);
  const url = endpoint(`/api/mobile/auth/google/start?platform=android&code_challenge=${encodeURIComponent(challenge)}&state=${encodeURIComponent(state)}`);
  await Browser.open({ url, presentationStyle: 'popover' });
}

export async function completeGoogleSignIn(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const [verifier, expectedState] = await Promise.all([secureSession.get('oauthVerifier'), secureSession.get('oauthState')]);
  if (!code || !verifier || !returnedState || returnedState !== expectedState) throw new Error('Google sign-in callback validation failed.');
  const response = await fetch(endpoint('/api/mobile/auth/exchange'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier, platform: 'android', deviceId: await ensureDeviceId() }),
  });
  const tokens = await acceptTokens(await parse<MobileSessionTokens>(response));
  await Promise.all([secureSession.remove('oauthVerifier'), secureSession.remove('oauthState'), Browser.close().catch(() => undefined)]);
  return tokens;
}

export async function restoreSession() {
  const refreshToken = await secureSession.get('refreshToken');
  if (!refreshToken) return null;
  try {
    const response = await fetch(endpoint('/api/mobile/auth/refresh'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
    return acceptTokens(await parse<MobileSessionTokens>(response));
  } catch (error) {
    await secureSession.remove('refreshToken');
    accessToken = null;
    throw error;
  }
}

export async function authenticatedGet<T>(path: string): Promise<T> {
  if (!accessToken) await restoreSession();
  let response = await fetch(endpoint(path), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 401 && await secureSession.get('refreshToken')) {
    await restoreSession();
    response = await fetch(endpoint(path), { headers: { Authorization: `Bearer ${accessToken}` } });
  }
  return parse<T>(response);
}

export async function loadWorkspace() { return authenticatedGet<MobileWorkspace>('/api/mobile/workspace'); }

export async function logout() {
  if (accessToken) await fetch(endpoint('/api/mobile/auth/logout'), { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => undefined);
  accessToken = null;
  await secureSession.remove('refreshToken');
}

export function mobileApiConfigured() { return Boolean(apiBase); }
