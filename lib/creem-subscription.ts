import { organizationDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { creemApi, creemPlanForProduct, getCreemConfig, type CreemConfig } from '@/lib/creem-config';
import type { PaidActiprocPlan } from '@/lib/billing-plans';

export type CreemSnapshot = {
 subscriptionId: string; customerId: string; productId: string; plan: PaidActiprocPlan;
 status: 'active'|'trialing'|'past_due'|'cancelled'|'paused'|'expired';
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
 if (!subscriptionId?.startsWith('sub_') || !customerId?.startsWith('cust_') || !productId || !plan)
   throw new Error('Creem subscription references an unexpected product or identifier');
 if (input.mode !== config.mode) throw new Error('Creem subscription test/live mode mismatch');
 const seats = Number(input.items?.[0]?.units ?? input.units ?? 1);
 if (!Number.isInteger(seats) || seats<1 || seats>500 || (plan==='individual' && seats!==1))
   throw new Error('Invalid Creem subscription seat count');
 const statusRaw=String(input.status ?? '');
 const periodEnd=validIso(input.current_period_end_date);
 const updatedAt=validIso(input.updated_at);
 if (!updatedAt) throw new Error('Missing authoritative Creem subscription updated_at');
 let status:CreemSnapshot['status'];
 switch (statusRaw) {
  case 'active': status='active'; break;
  case 'trialing': status='trialing'; break;
  case 'unpaid': status='past_due'; break;
  case 'scheduled_cancel': status='cancelled'; break;
  case 'canceled': status=periodEnd && Date.parse(periodEnd)>Date.now() ? 'cancelled':'expired'; break;
  case 'paused': status='paused'; break;
  default: throw new Error('Unexpected Creem subscription status: '+statusRaw);
 }
 if (status==='cancelled' && !periodEnd) throw new Error('Cancelled Creem subscription missing period end');
 return {subscriptionId,customerId,productId,plan,status,seats,periodEnd,updatedAt,testMode:config.mode==='test'};
}
export async function fetchCreemSubscription(id: string,config:CreemConfig=getCreemConfig()):Promise<CreemSnapshot> {
 const json=await creemApi<any>(config,'GET','subscriptions?subscription_id='+encodeURIComponent(id));
 return normalizeCreemSubscription(json,config);
}
export async function reconcileCreemSubscription(organizationId: string,subscriptionId: string, config: CreemConfig=getCreemConfig()):Promise<{applied:boolean;snapshot:CreemSnapshot}> {
 const org:any=await organizationDb.getById(organizationId);
 if (!org) throw new Error('Organization not found');
 if (org.billing_provider==='lemon' || (org.ls_subscription_id && org.subscription_status!=='expired'))
   throw new Error('Existing Lemon subscription cannot be replaced automatically');
 if (org.creem_subscription_id && org.creem_subscription_id!==subscriptionId)
   throw new Error('Different Creem subscription already linked');
 if (org.creem_payment_hold) throw new Error('Creem payment hold requires manual review');
 const snapshot=await fetchCreemSubscription(subscriptionId,config);
 const {data,error}=await (supabaseAdmin as any).rpc('apply_creem_subscription_snapshot',{
  p_organization_id: organizationId,p_subscription_id:snapshot.subscriptionId,
  p_customer_id:snapshot.customerId,p_product_id:snapshot.productId,
  p_plan_name:snapshot.plan,p_status:snapshot.status,p_seats:snapshot.seats,
  p_period_end:snapshot.periodEnd,p_test_mode:snapshot.testMode,p_updated_at:snapshot.updatedAt
 });
 if(error)throw error;
 if (data!==true) console.warn('[creem] Snapshot ignored by database guard', {organizationId,subscriptionId});
 return {applied:data===true,snapshot};
}
