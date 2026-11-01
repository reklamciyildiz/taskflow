import crypto from 'node:crypto';

/** Validates the event envelope without assuming Creem IDs contain only letters. */
export function validCreemEventId(id: unknown): id is string {
  return typeof id === 'string' && /^evt_[A-Za-z0-9_-]{1,128}$/.test(id);
}

/** HMAC is over the raw request body, never the parsed or reserialized JSON. */
export function verifyCreemSignature(raw: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  const computed = crypto.createHmac('sha256', secret).update(raw).digest();
  const received = Buffer.from(signature, 'hex');
  return computed.length === received.length && crypto.timingSafeEqual(computed, received);
}

/** Only paid, completed, correctly scoped checkouts can activate access. */
export function paidCreemCheckoutMatches(
  checkout: any,
  expected: { checkoutId: string; requestId: string; mode: 'test' | 'prod'; productId: string; seats: number },
): boolean {
  const productId = typeof checkout?.product === 'string' ? checkout.product : checkout?.product?.id;
  return checkout?.id === expected.checkoutId &&
    checkout?.request_id === expected.requestId &&
    checkout?.mode === expected.mode &&
    checkout?.status === 'completed' &&
    checkout?.order?.status === 'paid' &&
    productId === expected.productId &&
    Number.isInteger(Number(checkout?.units)) &&
    Number(checkout.units) === expected.seats;
}
