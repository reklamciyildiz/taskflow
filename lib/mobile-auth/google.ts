import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { google } from 'googleapis';
import { mobileBetaAllowlistConfigured, MobileAuthError } from './server';

function encryptionKey(): Buffer {
  const value = process.env.MOBILE_AUTH_ENCRYPTION_KEY;
  if (!value || value.length < 32) throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Mobile OAuth encryption is not configured.');
  return createHash('sha256').update(value).digest();
}

export function encryptEphemeral(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptEphemeral(value: string): string {
  const parts = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (parts.length !== 3) throw new MobileAuthError('INVALID_OAUTH_STATE', 400, 'OAuth state is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), parts[0]);
  decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString('utf8');
}

function canonicalizeRedirectUri(raw?: string): string {
  const fallback = 'https://www.actiproc.com/api/mobile/auth/google/callback';
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.hostname.includes('getaxiomm.vercel.app') || url.hostname.includes('actiproc.vercel.app')) {
      url.hostname = 'www.actiproc.com';
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

function canonicalizeAppLink(raw?: string): string {
  const fallback = 'https://www.actiproc.com/mobile/auth/callback';
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.hostname.includes('getaxiomm.vercel.app') || url.hostname.includes('actiproc.vercel.app')) {
      url.hostname = 'www.actiproc.com';
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

export function mobileGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const rawRedirect = process.env.MOBILE_GOOGLE_CALLBACK_URL || 'https://www.actiproc.com/api/mobile/auth/google/callback';
  const redirectUri = canonicalizeRedirectUri(rawRedirect);
  if (!clientId || !clientSecret || !redirectUri) throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Mobile Google OAuth is not configured.');
  const parsedRedirect = new URL(redirectUri);
  if (parsedRedirect.protocol !== 'https:') throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Mobile Google callback must use HTTPS.');
  return { clientId, redirectUri, client: new google.auth.OAuth2(clientId, clientSecret, redirectUri) };
}

export function mobileGoogleAuthConfigured(): boolean {
  try {
    if (process.env.AXIOM_MOBILE_AUTH_ENABLED !== 'true'
      || !mobileBetaAllowlistConfigured()
      || !process.env.MOBILE_AUTH_ENCRYPTION_KEY
      || process.env.MOBILE_AUTH_ENCRYPTION_KEY.length < 32) return false;
    mobileGoogleClient();
    mobileAppLinkUrl();
    return true;
  } catch {
    return false;
  }
}

export function mobileAppLinkUrl(expected?: string): URL {
  const configured = canonicalizeAppLink(process.env.MOBILE_AUTH_APP_LINK_URL || 'https://www.actiproc.com/mobile/auth/callback');
  const raw = expected ? canonicalizeAppLink(expected) : configured;
  if (!raw) throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Mobile App Link is not configured.');
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Mobile App Link must use HTTPS.');
  if (expected && canonicalizeAppLink(expected) !== configured) {
    throw new MobileAuthError('INVALID_OAUTH_STATE', 400, 'OAuth redirect target is no longer valid.');
  }
  return url;
}
