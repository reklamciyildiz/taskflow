import { loadEnvConfig } from '@next/env';
import { ACTIPROC_PLANS } from '../lib/billing-plans';

// Read developer-owned .env.local through Next's standard environment loader.
// Never print the API key or webhook secret.
loadEnvConfig(process.cwd(), true);

async function main(): Promise<void> {
  if (process.env.CREEM_MODE !== 'test') {
    throw new Error('Only CREEM_MODE=test is permitted by this preflight script.');
  }
  const apiKey = process.env.CREEM_API_KEY?.trim();
  if (!apiKey || /placeholder|your-|paste|example/i.test(apiKey)) {
    throw new Error('Set the Creem TEST API key in .env.local before verifying products.');
  }
  const settings = [
    ['Individual', process.env.CREEM_PRODUCT_INDIVIDUAL, ACTIPROC_PLANS.individual.priceUsd * 100, 'every-year'],
    ['Pro', process.env.CREEM_PRODUCT_PRO, ACTIPROC_PLANS.pro.priceUsd * 100, 'every-month'],
    ['Team', process.env.CREEM_PRODUCT_TEAM, ACTIPROC_PLANS.team.priceUsd * 100, 'every-month'],
  ] as const;
  const ids = settings.map(([, id]) => id?.trim());
  if (ids.some(id => !id || !/^prod_[A-Za-z0-9]+$/.test(id)) || new Set(ids).size !== 3) {
    throw new Error('Copy three distinct Product IDs exactly from the Creem test dashboard.');
  }

  let failed = false;
  for (const [name, productId, cents, cadence] of settings) {
    const response = await fetch('https://test-api.creem.io/v1/products?product_id=' + encodeURIComponent(productId!), {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error(name + ': failed Creem test API lookup (HTTP ' + response.status + ')');
      failed = true;
      continue;
    }
    const product: Record<string, unknown> = await response.json();
    const problems: string[] = [];
    if (product.id !== productId) problems.push('product ID');
    if (product.mode !== 'test') problems.push('test mode');
    if (product.price !== cents) problems.push('USD price');
    if (product.currency !== 'USD') problems.push('currency');
    if (product.billing_type !== 'recurring') problems.push('subscription type');
    if (product.billing_period !== cadence) problems.push('billing period');
    if (product.tax_mode !== 'exclusive') problems.push('tax mode');
    if (product.tax_category !== 'saas') problems.push('SaaS tax category');
    if (product.status !== 'active') problems.push('active status');
    if (problems.length) {
      console.error(name + ': mismatch in ' + problems.join(', '));
      failed = true;
    } else {
      console.log(name + ': OK ($' + (cents / 100).toFixed(2) + '/' + (cadence === 'every-year' ? 'year' : 'month') + ')');
    }
  }
  if (failed) {
    process.exitCode = 1;
  } else {
    console.log('All three Creem TEST products match Actiproc billing configuration.');
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Creem preflight failed.');
  process.exitCode = 1;
});
