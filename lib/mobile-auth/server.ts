import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { userDb } from '@/lib/db';
import type { MobileSessionTokens, MobileUser } from '@/shared/mobile-contracts';

const ACCESS_TTL_MS = 15 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;

export class MobileAuthError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
  }
}

export function mobileAuthEnabled(): boolean {
  return process.env.AXIOM_MOBILE_AUTH_ENABLED === 'true';
}

function pepper(): string {
  const value = process.env.MOBILE_AUTH_TOKEN_PEPPER;
  if (!value || value.length < 32) throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Mobile authentication is not configured.');
  return value;
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(`${pepper()}\u0000${value}`).digest('hex');
}

export function hashPkceVerifier(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function publicMobileUser(user: any): MobileUser {
  return {
    id: String(user.id),
    email: String(user.email),
    name: user.name ? String(user.name) : null,
    avatarUrl: user.avatar_url ? String(user.avatar_url) : null,
    organizationId: user.organization_id ? String(user.organization_id) : null,
    role: user.role ? String(user.role) : null,
  };
}

export async function issueMobileSession(input: {
  user: any;
  platform: 'android' | 'ios';
  deviceId?: string | null;
}): Promise<MobileSessionTokens> {
  const accessToken = randomToken();
  const refreshToken = randomToken(48);
  const now = Date.now();
  const accessTokenExpiresAt = new Date(now + ACCESS_TTL_MS).toISOString();
  const refreshTokenExpiresAt = new Date(now + REFRESH_TTL_MS).toISOString();
  const { error } = await supabaseAdmin.from('mobile_auth_sessions').insert({
    user_id: input.user.id,
    access_token_hash: hashSecret(accessToken),
    refresh_token_hash: hashSecret(refreshToken),
    device_id_hash: input.deviceId ? hashSecret(input.deviceId) : null,
    platform: input.platform,
    access_expires_at: accessTokenExpiresAt,
    refresh_expires_at: refreshTokenExpiresAt,
  });
  if (error) throw error;
  return { accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, user: publicMobileUser(input.user) };
}

export async function rotateMobileSession(refreshToken: string): Promise<MobileSessionTokens> {
  const accessToken = randomToken();
  const nextRefreshToken = randomToken(48);
  const now = Date.now();
  const accessTokenExpiresAt = new Date(now + ACCESS_TTL_MS).toISOString();
  const refreshTokenExpiresAt = new Date(now + REFRESH_TTL_MS).toISOString();
  const { data, error } = await supabaseAdmin.rpc('rotate_mobile_auth_session', {
    p_refresh_token_hash: hashSecret(refreshToken),
    p_new_access_token_hash: hashSecret(accessToken),
    p_new_refresh_token_hash: hashSecret(nextRefreshToken),
    p_access_expires_at: accessTokenExpiresAt,
    p_refresh_expires_at: refreshTokenExpiresAt,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || result.status !== 'ok' || !result.user_id) {
    const replayed = result?.status === 'replayed';
    throw new MobileAuthError(replayed ? 'REFRESH_REPLAY_DETECTED' : 'INVALID_REFRESH_TOKEN', 401, replayed ? 'Session revoked because a refresh token was reused.' : 'Refresh session is invalid or expired.');
  }
  const user = await userDb.getById(String(result.user_id));
  return { accessToken, refreshToken: nextRefreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, user: publicMobileUser(user) };
}

export type MobileAuthContext = { user: any; sessionId: string; accessTokenHash: string };

export async function authenticateMobileRequest(request: NextRequest): Promise<MobileAuthContext> {
  if (!mobileAuthEnabled()) throw new MobileAuthError('FEATURE_DISABLED', 404, 'Not found.');
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(authorization);
  if (!match) throw new MobileAuthError('UNAUTHORIZED', 401, 'A valid mobile bearer token is required.');
  const accessTokenHash = hashSecret(match[1]);
  const { data, error } = await supabaseAdmin
    .from('mobile_auth_sessions')
    .select('id,user_id,access_expires_at,refresh_expires_at,revoked_at')
    .eq('access_token_hash', accessTokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at || Date.parse(data.access_expires_at) <= Date.now() || Date.parse(data.refresh_expires_at) <= Date.now()) {
    throw new MobileAuthError('ACCESS_TOKEN_EXPIRED', 401, 'Mobile access token is invalid or expired.');
  }
  const user = await userDb.getById(String(data.user_id));
  if (!user?.id) throw new MobileAuthError('UNAUTHORIZED', 401, 'User no longer exists.');
  return { user, sessionId: String(data.id), accessTokenHash };
}

export async function consumeMobileAuthRateLimit(request: NextRequest, scope: string, identity: string, limit = 8): Promise<void> {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const bucket = hashSecret(`${scope}:${forwarded}:${identity.toLowerCase()}`);
  const { data, error } = await supabaseAdmin.rpc('consume_mobile_auth_rate_limit', { p_bucket_key: bucket, p_window_seconds: 900, p_limit: limit });
  if (error) throw error;
  if (data !== true) throw new MobileAuthError('RATE_LIMITED', 429, 'Too many sign-in attempts. Please try again later.');
}

function allowedOrigins(): Set<string> {
  const configured = (process.env.MOBILE_AUTH_ALLOWED_ORIGINS ?? '').split(',').map((v) => v.trim()).filter(Boolean);
  if (process.env.NODE_ENV !== 'production') configured.push('https://localhost', 'http://localhost');
  return new Set(configured);
}

export function mobileCorsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins().has(origin)) return { 'Cache-Control': 'no-store' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
}

export function mobileJson(request: NextRequest, body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: mobileCorsHeaders(request) });
}

export function mobileErrorResponse(request: NextRequest, error: unknown): NextResponse {
  if (error instanceof MobileAuthError) return mobileJson(request, { success: false, error: { code: error.code, message: error.message } }, error.status);
  console.error('Mobile auth error:', error instanceof Error ? error.message : String(error));
  return mobileJson(request, { success: false, error: { code: 'INTERNAL_ERROR', message: 'Mobile authentication failed.' } }, 500);
}

export function mobileOptions(request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins().has(origin)) return new NextResponse(null, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(null, { status: 204, headers: mobileCorsHeaders(request) });
}
