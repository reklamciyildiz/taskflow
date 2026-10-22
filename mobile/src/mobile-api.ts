import type {
  MobileActionDetail,
  MobileKnowledgeEntry,
  MobilePlannerToday,
  MobileProcessDetail,
  MobileSessionTokens,
  MobileWorkspace,
} from '../../shared/mobile-contracts';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { secureSession } from './secure-session';

const apiBase = (import.meta.env.VITE_AXIOM_API_ORIGIN ?? '').replace(/\/$/, '');
let accessToken: string | null = null;

function endpoint(path: string) {
  if (!apiBase) throw new Error('Mobile API environment is not configured.');
  return `${apiBase}${path}`;
}

function platform(): 'android' | 'ios' {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

async function mobileFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(endpoint(path), init);
  } catch (error) {
    if (error instanceof TypeError) {
      const localHint = import.meta.env.MODE === 'android-staging'
        ? ' Restart the local staging bridge with `npm --prefix mobile run android:connect:staging`.'
        : '';
      throw new Error(`Axiom could not reach the mobile API.${localHint}`);
    }
    throw error;
  }
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
  const response = await mobileFetch('/api/mobile/auth/credentials', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, platform: platform(), deviceId: await ensureDeviceId() }),
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
  const url = endpoint(`/api/mobile/auth/google/start?platform=${platform()}&code_challenge=${encodeURIComponent(challenge)}&state=${encodeURIComponent(state)}`);
  await Browser.open({ url, presentationStyle: 'popover' });
}

export async function googleOAuthAvailable(): Promise<boolean> {
  const response = await mobileFetch('/api/mobile/auth/google/status');
  const result = await parse<{ enabled: boolean }>(response);
  return result.enabled === true;
}

export async function completeGoogleSignIn(callbackUrl: string) {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error');
  const returnedState = url.searchParams.get('state');
  const [verifier, expectedState] = await Promise.all([secureSession.get('oauthVerifier'), secureSession.get('oauthState')]);
  if (!verifier || !returnedState || returnedState !== expectedState) throw new Error('Google sign-in callback validation failed.');
  if (providerError) {
    await Promise.all([secureSession.remove('oauthVerifier'), secureSession.remove('oauthState'), Browser.close().catch(() => undefined)]);
    throw new Error(providerError === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in could not be completed.');
  }
  if (!code) throw new Error('Google sign-in callback validation failed.');
  const response = await mobileFetch('/api/mobile/auth/exchange', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: verifier, platform: platform(), deviceId: await ensureDeviceId() }),
  });
  const tokens = await acceptTokens(await parse<MobileSessionTokens>(response));
  await Promise.all([secureSession.remove('oauthVerifier'), secureSession.remove('oauthState'), Browser.close().catch(() => undefined)]);
  return tokens;
}

export async function restoreSession() {
  const refreshToken = await secureSession.get('refreshToken');
  if (!refreshToken) return null;
  try {
    const response = await mobileFetch('/api/mobile/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
    return acceptTokens(await parse<MobileSessionTokens>(response));
  } catch (error) {
    await secureSession.remove('refreshToken');
    accessToken = null;
    throw error;
  }
}

export async function authenticatedGet<T>(path: string): Promise<T> {
  return authenticatedRequest<T>(path);
}

export async function authenticatedFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!accessToken) await restoreSession();
  const request = () => mobileFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  let response = await request();
  if (response.status === 401 && await secureSession.get('refreshToken')) {
    await restoreSession();
    response = await request();
  }
  return response;
}

export async function authenticatedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return parse<T>(await authenticatedFetch(path, init));
}

export async function loadWorkspace() { return authenticatedGet<MobileWorkspace>('/api/mobile/workspace'); }
export async function loadProcess(processId: string) { return authenticatedGet<MobileProcessDetail>(`/api/mobile/processes/${encodeURIComponent(processId)}`); }
export async function loadAction(actionId: string) { return authenticatedGet<MobileActionDetail>(`/api/mobile/actions/${encodeURIComponent(actionId)}`); }
export async function loadPlannerToday(date: string, timeZone: string) {
  const query = new URLSearchParams({ date, timeZone });
  return authenticatedGet<MobilePlannerToday>(`/api/mobile/planner/today?${query}`);
}
export async function loadPlannerContext(teamId?: string) {
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
  return authenticatedGet<any>(`/api/mobile/planner/context${query}`);
}
export async function loadKnowledge(limit = 30) {
  return authenticatedGet<MobileKnowledgeEntry[]>(`/api/mobile/knowledge?limit=${Math.min(50, Math.max(1, limit))}`);
}

export async function logout() {
  if (accessToken) await mobileFetch('/api/mobile/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }).catch(() => undefined);
  accessToken = null;
  await secureSession.remove('refreshToken');
}

export function mobileApiConfigured() { return Boolean(apiBase); }
