import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyCreemPlanUpgradePayment, type PendingPlanUpgrade } from '@/lib/creem-plan-payment';
import { getCreemConfig, type CreemConfig } from '@/lib/creem-config';
import type { CreemSnapshot } from '@/lib/creem-subscription-contract';

/** Caller must first reconcile the authoritative provider subscription snapshot.
 * The pending record stays open on any missing or unverified invoice.
 * Never call the provider's mutation endpoint from reconciliation.
 */
export async function reconcilePendingCreemPlanChange(
 orgId:string, snapshot:CreemSnapshot, config:CreemConfig=getCreemConfig()
):Promise<{pending:boolean;settled:boolean}> {
 if(process.env.CREEM_PLAN_MUTATIONS_ENABLED!=='true')return {pending:false,settled:false};
 const {data:pending,error}=await (supabaseAdmin as any).from('creem_plan_changes')
   .select('subscription_id,customer_id,previous_plan,desired_plan,previous_product_id,desired_product_id,previous_transaction_id,previous_seats,created_at')
   .eq('organization_id',orgId).in('status',['pending','awaiting_sync','review']).maybeSingle();
 if(error)throw error;
 if(!pending)return {pending:false,settled:false};
 if(snapshot.subscriptionId!==pending.subscription_id || snapshot.status!=='active' ||
    snapshot.plan!==pending.desired_plan || snapshot.productId!==pending.desired_product_id ||
    snapshot.customerId!==pending.customer_id || snapshot.seats!==pending.previous_seats ||
    snapshot.testMode!==(config.mode==='test'))return {pending:true,settled:false};
 const paid=await verifyCreemPlanUpgradePayment(config,pending as PendingPlanUpgrade);
 if(!paid)return {pending:true,settled:false};
 const {data:confirmed,error:confirmError}=await (supabaseAdmin as any)
   .rpc('confirm_creem_plan_change',{p_org:orgId,p_subscription:pending.subscription_id,
     p_plan:pending.desired_plan,p_product:pending.desired_product_id});
 if(confirmError)throw confirmError;
 return {pending:confirmed!==true,settled:confirmed===true};
}
