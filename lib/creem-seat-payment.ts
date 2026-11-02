import { creemApi, creemResponseMode, type CreemConfig } from '@/lib/creem-config';
import { matchesFreshPaidCreemTransaction, type CreemPaidMutation } from '@/lib/creem-paid-mutation';

export type PendingSeatIncrease = CreemPaidMutation & {
 previous_seats:number;
 desired_seats:number;
};

/** A quantity increase + a subscription.paid event is insufficient proof:
 * reject wrong-customer, wrong-currency, non-invoice and unrelated renewals.
 */
export function matchesPaidSeatIncrease(
 change:PendingSeatIncrease, latestSubscription:any, rawTransaction:any,
 mode:'test'|'prod'
):boolean {
 const sub=latestSubscription?.subscription??latestSubscription;
 if(!Number.isSafeInteger(change.previous_seats)||
   !Number.isSafeInteger(change.desired_seats)||
   change.desired_seats<=change.previous_seats||
   !Array.isArray(sub?.items)||sub.items.length!==1||
   Number(sub.items[0]?.units)!==change.desired_seats)return false;
 return matchesFreshPaidCreemTransaction(change,latestSubscription,rawTransaction,mode);
}
export async function verifyCreemSeatIncreasePayment(
 config:CreemConfig,change:PendingSeatIncrease
):Promise<boolean> {
 if(!change.previous_transaction_id)return false;
 const subscription=await creemApi<any>(config,'GET','subscriptions?subscription_id='+
   encodeURIComponent(change.subscription_id));
 const sub=subscription?.subscription??subscription;
 const txId=sub?.last_transaction_id;
 if(typeof txId!=='string'||!/^tran_[A-Za-z0-9_-]+$/.test(txId)||
    txId===change.previous_transaction_id)return false;
 const transaction=await creemApi<any>(config,'GET','transactions?transaction_id='+
   encodeURIComponent(txId));
 return matchesPaidSeatIncrease(change,subscription,transaction,creemResponseMode(config));
}
