import { loadEnvConfig } from '@next/env';
import { ACTIPROC_PLANS, CREEM_EXPECTED_TAX_MODE } from '../lib/billing-plans';

// Read the developer's existing .env.local; never print API/webhook secrets.
loadEnvConfig(process.cwd(), true);

type Product = {
  id?: string; name?: string; mode?: string; price?: number;
  currency?: string; billing_type?: string; billing_period?: string;
  tax_mode?: string | null; tax_category?: string | null; status?: string;
};
const API = 'https://test-api.creem.io/v1';
const safe = (value: unknown): string => value == null ? '(missing)' : String(value);

async function main(): Promise<void> {
  if (process.env.CREEM_MODE !== 'test') {
    throw new Error('Only CREEM_MODE=test is permitted by this preflight script.');
  }
  const key = process.env.CREEM_API_KEY?.trim();
  if (!key || /placeholder|your-|paste|example/i.test(key)) {
    throw new Error('Set the Creem TEST API key in .env.local before verifying products.');
  }
  const headers = { 'x-api-key': key };
  const settings = [
    { name:'Individual', displayName:'Actiproc Individual', id:process.env.CREEM_PRODUCT_INDIVIDUAL, cents:ACTIPROC_PLANS.individual.priceUsd*100, cadence:'every-year' },
    { name:'Pro', displayName:'Actiproc Pro', id:process.env.CREEM_PRODUCT_PRO, cents:ACTIPROC_PLANS.pro.priceUsd*100, cadence:'every-month' },
    { name:'Team', displayName:'Actiproc Team', id:process.env.CREEM_PRODUCT_TEAM, cents:ACTIPROC_PLANS.team.priceUsd*100, cadence:'every-month' },
  ] as const;
  // Diagnose local configuration without printing credentials or product IDs.
  const ids = settings.map(p => p.id?.trim());
  let invalid = false;
  for (const [index, plan] of settings.entries()) {
    const value = ids[index];
    const variable = 'CREEM_PRODUCT_' + plan.name.toUpperCase();
    if (!value) {
      console.error(variable + ': missing or empty');
      invalid = true;
    } else if (!/^prod_[a-zA-Z0-9]+$/.test(value)) {
      console.error(variable + ': unexpected ID format (characters: ' + value.length +
        '). Recopy using the Product ID copy icon, not the payment link.');
      invalid = true;
    } else {
      console.log(variable + ': format OK (characters: ' + value.length + ')');
    }
  }
  if (new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length) {
    console.error('Two or more CREEM_PRODUCT_* variables contain the same ID.');
    invalid = true;
  }
  if (invalid) {
    throw new Error('Fix the indicated Product ID environment variables before contacting Creem.');
  }

  // Authoritative list resolves mistaken manual ID transcription without guessing.
  const catalogResponse = await fetch(API + '/products/search?page_number=1&page_size=100', { headers, cache:'no-store' });
  if (!catalogResponse.ok) {
    throw new Error('Could not enumerate test products (HTTP ' + catalogResponse.status + '). Check test API key and store.');
  }
  const catalog: unknown = await catalogResponse.json();
  if (!catalog || typeof catalog !== 'object' || !Array.isArray((catalog as any).items)) {
    throw new Error('Unexpected Creem product catalog response; cannot validate safely.');
  }
  const available: Product[] = (catalog as { items: Product[] }).items;
  let failed = false;
  for (const plan of settings) {
    const id = plan.id!.trim();
    const response = await fetch(API + '/products?product_id=' + encodeURIComponent(id), { headers, cache:'no-store' });
    if (!response.ok) {
      console.error(plan.name + ': product lookup returned HTTP ' + response.status);
      const matches = available.filter(p => p.name === plan.displayName && p.mode === 'test');
      if (matches.length === 1 && matches[0].id) {
        console.error('  Official Creem catalog ID: ' + matches[0].id);
        console.error('  Update CREEM_PRODUCT_' + plan.name.toUpperCase() + ' in .env.local using the Creem Copy ID button.');
      } else {
        console.error('  Could not identify a unique matching test product. Check the selected Creem store and key.');
      }
      failed = true;
      continue;
    }
    const product = await response.json() as Product;
    const issues: string[] = [];
    const expect = (field: keyof Product, value: string | number, label: string) => {
      if (product[field] !== value) issues.push(label + ': expected ' + safe(value) + ', got ' + safe(product[field]));
    };
    expect('id',id,'Product ID');
    expect('name',plan.displayName,'Product name');
    expect('mode','test','Environment');
    expect('price',plan.cents,'Price in cents');
    expect('currency','USD','Currency');
    expect('billing_type','recurring','Billing type');
    expect('billing_period',plan.cadence,'Billing period');
    expect('status','active','Status');
    expect('tax_category','saas','Tax category');
    expect('tax_mode',CREEM_EXPECTED_TAX_MODE,'Tax mode');
    if (issues.length) {
      console.error(plan.name + ': configuration mismatch');
      for (const issue of issues) console.error('  - ' + issue);
      failed = true;
    } else {
      console.log(plan.name + ': OK ($' + (plan.cents/100).toFixed(2) + '/' + (plan.cadence==='every-year'?'year':'month') + ')');
    }
  }
  if (failed) {
    console.error('Creem products are not ready for checkout. Do not enable NEW_BILLING_PROVIDER=creem.');
    process.exitCode = 1;
  } else {
    console.log('All three Creem TEST products match Actiproc billing configuration.');
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Creem product verification failed.');
  process.exitCode = 1;
});
