import { organizationDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { creemApi, getCreemConfig, type CreemConfig } from '@/lib/creem-config';
import { normalizeCreemSubscription, type CreemSnapshot } from '@/lib/creem-subscription-contract';

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
