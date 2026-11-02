import { creemApi, creemResponseMode, type CreemConfig } from '@/lib/creem-config';
import { matchesFreshPaidCreemTransaction, type CreemPaidMutation } from '@/lib/creem-paid-mutation';
import type { PaidActiprocPlan } from '@/lib/billing-plans';

export type PendingPlanUpgrade = CreemPaidMutation & {
 previous_plan:PaidActiprocPlan;
 desired_plan:PaidActiprocPlan;
 previous_product_id:string;
 desired_product_id:string;
 previous_seats:number;
 customer_id:string;
};

export function matchesPaidPlanUpgrade(
 change:PendingPlanUpgrade, rawSubscription:any, rawTransaction:any,
 mode:'test'|'prod'
):boolean {
 const sub=rawSubscription?.subscription??rawSubscription;
 const product=typeof sub?.product==='string'?sub.product:sub?.product?.id;
 const customer=typeof sub?.customer==='string'?sub.customer:sub?.customer?.id;
 const order=['individual','pro','team'];
 if(order.indexOf(change.desired_plan)<=order.indexOf(change.previous_plan) ||
    product!==change.desired_product_id || customer!==change.customer_id ||
    !Array.isArray(sub?.items)||sub.items.length!==1||
    Number(sub.items[0]?.units)!==change.previous_seats ||
    !Number.isSafeInteger(change.previous_seats)||change.previous_seats<1)
   return false;
 return matchesFreshPaidCreemTransaction(change,rawSubscription,rawTransaction,mode);
}

export async function verifyCreemPlanUpgradePayment(
 config:CreemConfig, change:PendingPlanUpgrade
):Promise<boolean> {
 if(!change.previous_transaction_id)return false;
 const response=await creemApi<any>(config,'GET','subscriptions?subscription_id='+
   encodeURIComponent(change.subscription_id));
 const sub=response?.subscription??response;
 const id=sub?.last_transaction_id;
 if(typeof id!=='string'||!/^tran_[A-Za-z0-9_-]+$/.test(id)||
    id===change.previous_transaction_id)return false;
 const transaction=await creemApi<any>(config,'GET','transactions?transaction_id='+
   encodeURIComponent(id));
 return matchesPaidPlanUpgrade(change,response,transaction,creemResponseMode(config));
}
