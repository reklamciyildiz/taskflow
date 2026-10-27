export type LemonPlan = 'pro' | 'team';
export type LemonMode = 'live' | 'test';

export type LemonBillingConfig = {
  apiKey: string;
  webhookSecret: string;
  storeId: string;
  mode: LemonMode;
  variants: Record<LemonPlan, { monthly: string; yearly: string }>;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function pair(env: NodeJS.ProcessEnv, name: string): { monthly: string; yearly: string } {
  const values = required(env, name)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length !== 2) {
    throw new Error(`${name} must contain exactly monthlyId,yearlyId`);
  }
  if (!values.every((value) => /^\d+$/.test(value))) {
    throw new Error(`${name} contains an invalid variant id`);
  }
  return { monthly: values[0], yearly: values[1] };
}

export function parseLemonMode(value: string | undefined): LemonMode {
  if (value === 'live' || value === 'test') return value;
  throw new Error('LEMONSQUEEZY_MODE must be exactly "live" or "test"');
}

export function assertLemonEnvironmentIsolation(
  mode: LemonMode,
  env: Partial<Pick<NodeJS.ProcessEnv, 'VERCEL_ENV' | 'NODE_ENV'>>,
): void {
  if (env.VERCEL_ENV === 'production' && mode !== 'live') {
    throw new Error('Production must use Lemon Squeezy live mode');
  }
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production' && mode !== 'test') {
    throw new Error('Preview/development deployments must use Lemon Squeezy test mode');
  }
  if (!env.VERCEL_ENV && env.NODE_ENV === 'development' && mode !== 'test') {
    throw new Error('Local development must use Lemon Squeezy test mode');
  }
}

export function getLemonBillingConfig(env: NodeJS.ProcessEnv = process.env): LemonBillingConfig {
  const mode = parseLemonMode(required(env, 'LEMONSQUEEZY_MODE'));
  assertLemonEnvironmentIsolation(mode, env);

  return {
    apiKey: required(env, 'LEMONSQUEEZY_API_KEY'),
    webhookSecret: required(env, 'LEMONSQUEEZY_WEBHOOK_SECRET'),
    storeId: required(env, 'LEMONSQUEEZY_STORE_ID'),
    mode,
    variants: {
      pro: pair(env, 'LEMON_VARIANT_PRO_IDS'),
      team: pair(env, 'LEMON_VARIANT_TEAM_IDS'),
    },
  };
}

export function planForVariant(
  variantId: string,
  config: Pick<LemonBillingConfig, 'variants'>,
): LemonPlan | null {
  if (Object.values(config.variants.pro).includes(variantId)) return 'pro';
  if (Object.values(config.variants.team).includes(variantId)) return 'team';
  return null;
}

export function variantForPlan(
  plan: LemonPlan,
  interval: 'monthly' | 'yearly',
  config: Pick<LemonBillingConfig, 'variants'>,
): string {
  return config.variants[plan][interval];
}
