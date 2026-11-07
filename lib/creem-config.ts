import type { BillingInterval, PaidActiprocPlan } from '@/lib/billing-plans';
export type CreemMode = 'test' | 'live';
/** Creem API responses use prod, not live, for production mode. */
export function creemResponseMode(config: Pick<CreemConfig, 'mode'>): 'test' | 'prod' { return config.mode === 'live' ? 'prod' : 'test'; }
export type CreemConfig = { apiKey: string; secret: string; mode: CreemMode; products: Record<PaidActiprocPlan,string>; yearlyProducts: Partial<Record<'pro'|'team',string>>; baseUrl: string };
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
/** Explicit production audience gate: a pilot OR deliberate public launch.
 * Missing or contradictory launch scope fails closed even if checkout enabled.
 * Must be checked after org-admin authorization and before provider calls.
 */
export function creemLiveCheckoutAudienceAllowed(
  organizationId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.VERCEL_ENV !== 'production' || env.CREEM_MODE !== 'live') return true;
  if (!organizationId) return false;
  const canaryId = env.CREEM_LIVE_CANARY_ORG_ID?.trim() ?? '';
  const publicEnabled = env.CREEM_LIVE_PUBLIC_CHECKOUT_ENABLED === 'true';
  if (canaryId && publicEnabled) return false;
  if (canaryId) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(canaryId)
      && canaryId === organizationId;
  }
  return publicEnabled;
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
  const yearlyProducts: CreemConfig['yearlyProducts'] = {};
  if (env.CREEM_PRODUCT_PRO_YEARLY?.trim()) yearlyProducts.pro = env.CREEM_PRODUCT_PRO_YEARLY.trim();
  if (env.CREEM_PRODUCT_TEAM_YEARLY?.trim()) yearlyProducts.team = env.CREEM_PRODUCT_TEAM_YEARLY.trim();
  const ids = [...Object.values(products), ...Object.values(yearlyProducts)];
  if (ids.some(p => !/^prod_[A-Za-z0-9]+$/.test(p)) || new Set(ids).size !== ids.length)
    throw new Error('Creem product IDs must be distinct prod_* identifiers');
  const apiKey=required('CREEM_API_KEY');
  const secret=required('CREEM_WEBHOOK_SECRET');
  // Creem test API keys are not authorized to operate in the production
  // checkout environment. A live endpoint must never silently use them.
  if (mode==='live' && /^creem_test_/i.test(apiKey))
    throw new Error('Creem test API key cannot be used in live mode');
  if (mode==='test' && /^creem_live_/i.test(apiKey))
    throw new Error('Creem live API key cannot be used in test mode');
  return {
    apiKey, secret,
    mode, products, yearlyProducts, baseUrl: mode === 'live' ? 'https://api.creem.io' : 'https://test-api.creem.io',
  };
}
/** Prevent a real checkout from sending customers back to localhost, an
 * unapproved domain or a staging URL after a successful live payment. */
export function assertCreemLiveReturnOrigin(appUrl: string): void {
  let parsed: URL;
  try { parsed = new URL(appUrl); }
  catch { throw new Error('Invalid live checkout return URL'); }
  if (parsed.protocol !== 'https:' ||
      !['actiproc.com','www.actiproc.com'].includes(parsed.hostname) ||
      parsed.port !== '' || (parsed.pathname !== '' && parsed.pathname !== '/') ||
      parsed.search || parsed.hash || parsed.username || parsed.password)
    throw new Error('Live checkout requires an approved Actiproc HTTPS return origin');
}

export function creemProductForPlan(
  plan: PaidActiprocPlan, config: CreemConfig, interval: BillingInterval = 'monthly'
): string {
  if (plan === 'individual' || interval === 'monthly') return config.products[plan];
  const annual = config.yearlyProducts[plan];
  if (!annual) throw new Error('Creem annual product is not configured for ' + plan);
  return annual;
}
export function creemPlanForProduct(productId: string, config: CreemConfig): PaidActiprocPlan | null {
  const match = Object.entries(config.products).find(([, id]) => id === productId)?.[0]
    ?? Object.entries(config.yearlyProducts).find(([, id]) => id === productId)?.[0];
  return (match ?? null) as PaidActiprocPlan | null;
}
export function creemIntervalForProduct(productId: string, config: CreemConfig): BillingInterval | null {
  if (Object.values(config.yearlyProducts).includes(productId) ||
      config.products.individual === productId) return 'yearly';
  if (config.products.pro === productId || config.products.team === productId) return 'monthly';
  return null;
}
export class CreemApiError extends Error {
  constructor(public readonly status:number, public readonly operation:string,
    public readonly providerCode:string|null, public readonly traceId:string|null) {
    super('Creem API request failed (' + status + ')');
    this.name='CreemApiError';
  }
}
export async function creemApi<T = any>(config: CreemConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const response = await fetch(config.baseUrl + '/v1/' + path, {
    method, cache: 'no-store',
    headers: { 'x-api-key': config.apiKey, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    // The Creem trace ID and standardized error code are safe to log and expose;
    // never echo raw provider bodies, card data, headers or API keys.
    const operation=path.split('?')[0].replace(/sub_[A-Za-z0-9_-]+/g,'{subscription}');
    const providerCode=typeof value?.error?.code==='string'?value.error.code:
      typeof value?.code==='string'?value.code:null;
    const traceId=typeof value?.trace_id==='string'?value.trace_id:null;
    console.error('[creem] API request failed', {operation,status:response.status,providerCode,traceId});
    throw new CreemApiError(response.status,operation,providerCode?.slice(0,60)??null,traceId?.slice(0,100)??null);
  }
  if (!value || typeof value !== 'object') throw new Error('Invalid Creem API response');
  return value as T;
}
