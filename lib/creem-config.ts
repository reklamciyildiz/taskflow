import type { PaidActiprocPlan } from '@/lib/billing-plans';
export type CreemMode = 'test' | 'live';
/** Creem API responses use prod, not live, for production mode. */
export function creemResponseMode(config: Pick<CreemConfig, 'mode'>): 'test' | 'prod' { return config.mode === 'live' ? 'prod' : 'test'; }
export type CreemConfig = { apiKey: string; secret: string; mode: CreemMode; products: Record<PaidActiprocPlan,string>; baseUrl: string };
/** Checkout always starts closed; test checkout on primary DB requires explicit local opt-in. */
export function creemCheckoutEnvironmentSafe(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CREEM_CHECKOUT_ENABLED !== 'true') return false;
  if (env.CREEM_MODE === 'live') return env.VERCEL_ENV === 'production';
  if (env.CREEM_MODE !== 'test' || env.VERCEL_ENV === 'production') return false;

  // This user runs Creem Test Mode from .env.local against their primary Supabase
  // project, deliberately. Never permit that override on Vercel or a deployed app.
  if (env.CREEM_TEST_ON_PRIMARY_DB === 'true') {
    if (env.NODE_ENV !== 'development' || !!env.VERCEL_ENV) return false;
    try {
      const authUrl = new URL(env.NEXTAUTH_URL ?? '');
      const supabaseUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '');
      return authUrl.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(authUrl.hostname) &&
        supabaseUrl.protocol === 'https:' &&
        /^[a-z0-9]+[.]supabase[.]co$/.test(supabaseUrl.hostname);
    } catch {
      return false;
    }
  }

  // Existing isolated staging mode remains available but is never required.
  const ref = env.AXIOM_STAGING_SUPABASE_PROJECT_REF?.trim();
  return !!ref && env.NEXT_PUBLIC_SUPABASE_URL === 'https://' + ref + '.supabase.co';
}
export function getCreemConfig(env: NodeJS.ProcessEnv = process.env): CreemConfig {
  const mode = env.CREEM_MODE;
  if (mode !== 'test' && mode !== 'live') throw new Error('CREEM_MODE must be test or live');
  if ((env.VERCEL_ENV === 'production' && mode !== 'live') ||
      (env.VERCEL_ENV && env.VERCEL_ENV !== 'production' && mode !== 'test') ||
      (!env.VERCEL_ENV && env.NODE_ENV === 'development' && mode !== 'test'))
    throw new Error('Creem test/live environment isolation failed');
  const required = (key: string): string => {
    const value = env[key]?.trim();
    if (!value) throw new Error('Missing Creem configuration: ' + key);
    return value;
  };
  const products = {
    individual: required('CREEM_PRODUCT_INDIVIDUAL'),
    pro: required('CREEM_PRODUCT_PRO'),
    team: required('CREEM_PRODUCT_TEAM'),
  };
  if (Object.values(products).some(p => !/^prod_[A-Za-z0-9]+$/.test(p)) || new Set(Object.values(products)).size !== 3)
    throw new Error('Creem product IDs must be three distinct prod_* identifiers');
  return {
    apiKey: required('CREEM_API_KEY'), secret: required('CREEM_WEBHOOK_SECRET'),
    mode, products, baseUrl: mode === 'live' ? 'https://api.creem.io' : 'https://test-api.creem.io',
  };
}
export function creemProductForPlan(plan: PaidActiprocPlan, config: CreemConfig): string { return config.products[plan]; }
export function creemPlanForProduct(productId: string, config: CreemConfig): PaidActiprocPlan | null {
  return (Object.entries(config.products).find(([, id]) => id === productId)?.[0] ?? null) as PaidActiprocPlan | null;
}
export async function creemApi<T = any>(config: CreemConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(config.baseUrl + '/v1/' + path, {
    method, cache: 'no-store',
    headers: { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    console.error('[creem] API request failed', { operation: path.split('?')[0], status: response.status });
    throw new Error('Creem payment service error (' + response.status + ')');
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid Creem API response');
  return value as T;
}
