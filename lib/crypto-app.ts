import crypto from 'crypto';

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY is not set (expected 32-byte key, base64 or hex).');
  }

  // Prefer base64 (44 chars typical), fallback hex
  try {
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length === 32) return b64;
  } catch {
    // ignore
  }

  const hex = Buffer.from(raw, 'hex');
  if (hex.length === 32) return hex;

  // Last resort: utf8 bytes (not ideal, but avoids hard crash in dev if misconfigured)
  const utf = Buffer.from(raw, 'utf8');
  if (utf.length === 32) return utf;

  throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (AES-256).');
}

export function encryptString(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptString(payloadB64: string): string {
  const key = getKey();
  const buf = Buffer.from(payloadB64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}
