/**
 * READ-ONLY Creem LIVE product preflight.
 * Does not create checkouts, subscriptions, customers, charges, refunds or
 * webhooks. Run only in a trusted server environment with LIVE credentials.
 * This command never prints credentials or customer information.
 */
import { CREEM_EXPECTED_TAX_MODE, actiprocPriceUsd, creemPeriodForInterval } from '../lib/billing-plans';
import {
  assertCreemLiveReturnOrigin, creemApi, creemProductForPlan, getCreemConfig, creemResponseMode,
} from '../lib/creem-config';

async function main() {
  if (process.env.CREEM_MODE !== 'live')
    throw new Error('CREEM_MODE=live is required for a live read-only preflight');
  const env = { ...process.env, VERCEL_ENV:'production' };
  const config = getCreemConfig(env);
  assertCreemLiveReturnOrigin(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '');
  if (creemResponseMode(config) !== 'prod')
    throw new Error('Live mode does not map to Creem production');
  if (/^creem_test_/i.test(config.apiKey))
    throw new Error('A test API key cannot validate live products');

  let failed = false;
  for (const {plan,interval} of [
    {plan:'individual',interval:'yearly'},
    {plan:'pro',interval:'monthly'},
    {plan:'pro',interval:'yearly'},
    {plan:'team',interval:'monthly'},
    {plan:'team',interval:'yearly'},
  ] as const) {
    const productId = creemProductForPlan(plan,config,interval);
    const product = await creemApi<any>(config,'GET',
      'products?product_id=' + encodeURIComponent(productId));
    const actualPrice = product?.price;
    const expectedPeriod = creemPeriodForInterval(interval);
    const checks: Record<string,boolean> = {
      id:product?.id === productId,
      environment:product?.mode === 'prod',
      active:product?.status === 'active',
      currency:product?.currency === 'USD',
      price:actualPrice === actiprocPriceUsd(plan,interval) * 100,
      billing:product?.billing_type === 'recurring' && product?.billing_period === expectedPeriod,
      tax:product?.tax_mode === CREEM_EXPECTED_TAX_MODE && product?.tax_category === 'saas',
    };
    const safeReport = {plan,interval,checks,passed:Object.values(checks).every(Boolean)};
    console.log(JSON.stringify(safeReport));
    if (!safeReport.passed) failed = true;
  }
  if (failed) throw new Error('Live product verification failed. Keep checkout disabled.');
  console.log('PASS: five live products match approved Actiproc pricing. No payments initiated.');
  console.log('Webhook delivery, live KYC and Production database validation must still be verified separately.');
}

void main().catch(error => {
  console.error('Live Creem verification failed:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
});
