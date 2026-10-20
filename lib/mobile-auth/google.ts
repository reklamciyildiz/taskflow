import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { google } from 'googleapis';
import { MobileAuthError } from './server';

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

export function mobileGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.MOBILE_GOOGLE_CALLBACK_URL;
  if (!clientId || !clientSecret || !redirectUri) throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Mobile Google OAuth is not configured.');
  return { clientId, redirectUri, client: new google.auth.OAuth2(clientId, clientSecret, redirectUri) };
}

export function mobileAppLinkUrl(): URL {
  const raw = process.env.MOBILE_AUTH_APP_LINK_URL;
  if (!raw) throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Mobile App Link is not configured.');
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new MobileAuthError('MOBILE_AUTH_NOT_CONFIGURED', 503, 'Mobile App Link must use HTTPS.');
  return url;
}
