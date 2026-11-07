import crypto from 'node:crypto';

/** Short-lived, server-signed acknowledgement bound to a single remote billing state.
 * Not a price quote: Creem currently calculates the final charge during mutation.
 */
export type BillingConsentPayload = {
  operation: 'seats' | 'upgrade';
  organizationId: string;
  subscriptionId: string;
  fromPlan: string;
  toPlan: string;
  fromSeats: number;
  toSeats: number;
  mode: 'test' | 'prod';
  billingInterval?: 'monthly' | 'yearly';
  lastTransactionId: string | null;
  updatedAt: string | null;
  periodEndAt: string | null;
  nextChargeAt: string | null;
  expiresAt: number;
};

export type BillingConsentState = Omit<BillingConsentPayload, 'expiresAt'>;

function secretKey(secret: string): Buffer {
  if (!secret || secret.length < 24) throw new Error('Billing consent signing secret unavailable');
  return crypto.createHash('sha256').update('actiproc-billing-consent-v1:').update(secret).digest();
}

export function issueBillingConsent(state: BillingConsentState, secret: string, now = Date.now()): string {
  const payload: BillingConsentPayload = {...state, expiresAt: now + 5 * 60_000};
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secretKey(secret)).update(data).digest('base64url');
  return data + '.' + mac;
}

export function verifyBillingConsent(
  token: unknown,
  expected: BillingConsentState,
  secret: string,
  now = Date.now(),
): boolean {
  if (typeof token !== 'string' || token.length > 4096 || !/^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$/.test(token))
    return false;
  const [data, providedMac] = token.split('.');
  const expectedMac = crypto.createHmac('sha256', secretKey(secret)).update(data).digest();
  const received = Buffer.from(providedMac, 'base64url');
  if (received.length !== expectedMac.length || !crypto.timingSafeEqual(received, expectedMac)) return false;
  let payload: BillingConsentPayload;
  try { payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); }
  catch { return false; }
  if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now || payload.expiresAt > now + 5 * 60_000)
    return false;
  const keys: (keyof BillingConsentState)[] = [
    'operation', 'organizationId', 'subscriptionId', 'fromPlan', 'toPlan',
    'fromSeats', 'toSeats', 'mode', 'lastTransactionId', 'updatedAt',
    'periodEndAt', 'nextChargeAt', 'billingInterval',
  ];
  return keys.every(key => payload[key] === expected[key]);
}
