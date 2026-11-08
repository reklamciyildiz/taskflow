import { creemIntervalForProduct, creemPlanForProduct, creemResponseMode, type CreemConfig } from '@/lib/creem-config';
import type { BillingInterval, PaidActiprocPlan } from '@/lib/billing-plans';

export type CreemSnapshot = {
 subscriptionId: string; customerId: string; productId: string; plan: PaidActiprocPlan;
 billingInterval: BillingInterval; status: 'active'|'trialing'|'past_due'|'cancelled'|'paused'|'expired';
 seats: number; periodEnd: string|null; updatedAt: string; testMode: boolean;
};
function idOf(v: unknown): string | null {
 if (typeof v === 'string') return v || null;
 if (v && typeof v === 'object' && typeof (v as any).id === 'string') return (v as any).id;
 return null;
}
function validIso(value: unknown): string | null {
 if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
 return new Date(value).toISOString();
}
export function normalizeCreemSubscription(source: any, config: CreemConfig): CreemSnapshot {
 const input = source?.subscription ?? source;
 const subscriptionId=idOf(input?.id), customerId=idOf(input?.customer);
 const productId=idOf(input?.product) ?? idOf(input?.items?.[0]?.product_id);
 const plan = productId ? creemPlanForProduct(productId,config):null;
 const billingInterval = productId ? creemIntervalForProduct(productId,config):null;
 if (!subscriptionId?.startsWith('sub_') || !customerId?.startsWith('cust_') || !productId || !plan || !billingInterval)
   throw new Error('Creem subscription references an unexpected product or identifier');
 if (input.mode !== creemResponseMode(config)) throw new Error('Creem subscription test/live mode mismatch');
 const seats = Number(input.items?.[0]?.units ?? input.units ?? 1);
 if (!Number.isInteger(seats) || seats<1 || seats>500)
   throw new Error('Invalid Creem subscription seat count');
 const statusRaw=String(input.status ?? '');
 const periodEnd=validIso(input.current_period_end_date);
 const updatedAt=validIso(input.updated_at);
 if (!updatedAt) throw new Error('Missing authoritative Creem subscription updated_at');
 let status:CreemSnapshot['status'];
 switch (statusRaw) {
  case 'active': status='active'; break;
  case 'trialing': status='trialing'; break;
  case 'unpaid':
  case 'past_due': status='past_due'; break;
  case 'scheduled_cancel': status='cancelled'; break;
  case 'expired': status='expired'; break;
  case 'canceled': status=periodEnd && Date.parse(periodEnd)>Date.now() ? 'cancelled':'expired'; break;
  case 'paused': status='paused'; break;
  default: throw new Error('Unexpected Creem subscription status: '+statusRaw);
 }
 if (status==='cancelled' && !periodEnd) throw new Error('Cancelled Creem subscription missing period end');
 return {subscriptionId,customerId,productId,plan,billingInterval,status,seats,periodEnd,updatedAt,testMode:config.mode==='test'};
}
