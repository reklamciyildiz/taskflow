/** Pure config parser: never infer a paid account entitlement from a model name. */
export function configuredRequestBudget(raw:string|undefined, fallback:number):number {
  if (!raw || !/^[1-9]\d{0,4}$/.test(raw)) return fallback;
  const value=Number(raw);
  return Number.isSafeInteger(value)&&value>=1&&value<=10_000?value:fallback;
}

export type CapacityPolicy = {
  modelTokenLimit:number;
  providerTokenLimit:number;
  modelRequestLimit:number;
  providerRequestLimit:number;
};

export function providerCapacityPolicy(input:{
  provider:'groq'|'openai';
  modelTokenLimit:number;
  env?:Record<string,string|undefined>;
}):CapacityPolicy {
  const env=input.env??process.env;
  if(input.provider==='groq'){
    const providerTokenLimit=positiveCap(env.AI_GROQ_ACCOUNT_TPM_BUDGET,input.modelTokenLimit);
    return {
      modelTokenLimit:input.modelTokenLimit,
      providerTokenLimit,
      modelRequestLimit:configuredRequestBudget(env.AI_GROQ_MODEL_RPM_BUDGET,24),
      providerRequestLimit:configuredRequestBudget(env.AI_GROQ_ACCOUNT_RPM_BUDGET,24),
    };
  }
  return {
    modelTokenLimit:input.modelTokenLimit,
    providerTokenLimit:positiveCap(env.AI_FALLBACK_ACCOUNT_TPM_BUDGET,input.modelTokenLimit),
    modelRequestLimit:configuredRequestBudget(env.AI_FALLBACK_MODEL_RPM_BUDGET,20),
    providerRequestLimit:configuredRequestBudget(env.AI_FALLBACK_ACCOUNT_RPM_BUDGET,20),
  };
}

function positiveCap(raw:string|undefined,fallback:number):number {
  if(!raw || !/^[1-9]\d{0,6}$/.test(raw))return fallback;
  const parsed=Number(raw);
  return Number.isSafeInteger(parsed)&&parsed>=1000&&parsed<=1_000_000?parsed:fallback;
}

/**
 * A bounded admission denial may be retried once before any generation.
 * This never waits through a minute-scale reset on a serverless connection.
 */
export function admissionRetryDelayMs(input:{
  allowed:boolean;retryAfterSeconds?:number;reason?:string;
  enabled:boolean;timeRemainingMs:number;
}):number|null {
  if(!input.enabled||input.allowed||input.reason==='oversized'||input.reason==='disabled'||input.reason==='unavailable')return null;
  const delay=(input.retryAfterSeconds??0)*1000;
  return Number.isFinite(delay)&&delay>0&&delay<=1200&&input.timeRemainingMs>delay+5000
    ?Math.max(150,Math.ceil(delay)) : null;
}
