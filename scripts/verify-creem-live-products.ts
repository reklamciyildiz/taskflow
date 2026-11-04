/**
 * READ-ONLY Creem LIVE product preflight.
 * Does not create checkouts, subscriptions, customers, charges, refunds or
 * webhooks. Run only in a trusted server environment with LIVE credentials.
 * This command never prints credentials or customer information.
 */
import { ACTIPROC_PLANS, CREEM_EXPECTED_TAX_MODE } from '../lib/billing-plans';
import {
  assertCreemLiveReturnOrigin, creemApi, getCreemConfig, creemResponseMode,
} from '../lib/creem-config';

async function main() {
  if (process.env.CREEM_MODE !== 'live')
    throw new Error('CREEM_MODE=live is required for a live read-only preflight');
  const env = { ...process.env, VERCEL_ENV:'production' };
  const config = getCreemConfig(env);
  assertCreemLiveReturnOrigin(env.NEXT_PUBLIC_APP_URL || env.NEXTAUTH_URL || '');
  if (creemResponseMode(config) !== 'prod')
    throw new Error('Live mode does not map to Creem production');
  if (/^creem_test_/i.test(config.apiKey))
    throw new Error('A test API key cannot validate live products');

  let failed = false;
  for (const plan of ['individual','pro','team'] as const) {
    const productId = config.products[plan];
    const expected = ACTIPROC_PLANS[plan];
    const product = await creemApi<any>(config,'GET',
      'products?product_id=' + encodeURIComponent(productId));
    const actualPrice = product?.price;
    const interval = plan === 'individual' ? 'every-year' : 'every-month';
    const checks: Record<string,boolean> = {
      id:product?.id === productId,
      environment:product?.mode === 'prod',
      active:product?.status === 'active',
      currency:product?.currency === 'USD',
      price:actualPrice === expected.priceUsd * 100,
      billing:product?.billing_type === 'recurring' && product?.billing_period === interval,
      tax:product?.tax_mode === CREEM_EXPECTED_TAX_MODE && product?.tax_category === 'saas',
    };
    const safeReport = {plan,checks,passed:Object.values(checks).every(Boolean)};
    console.log(JSON.stringify(safeReport));
    if (!safeReport.passed) failed = true;
  }
  if (failed) throw new Error('Live product verification failed. Keep checkout disabled.');
  console.log('PASS: three live products match approved Actiproc pricing. No payments initiated.');
  console.log('Webhook delivery, live KYC and Production database validation must still be verified separately.');
}

void main().catch(error => {
  console.error('Live Creem verification failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
