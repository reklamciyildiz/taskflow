import { creemApi, creemResponseMode, type CreemConfig } from '@/lib/creem-config';

export type PendingSeatIncrease = {
  subscription_id:string;
  previous_seats:number;
  desired_seats:number;
  previous_transaction_id:string|null;
  created_at:string;
};

function asTimestamp(value:unknown):number|null {
  if(typeof value==='number'&&Number.isFinite(value)) {
    const ms=value<1e11?value*1000:value;
    return Number.isFinite(ms)?ms:null;
  }
  if(typeof value==='string'&&value.trim()) {
    const time=Date.parse(value);
    return Number.isFinite(time)?time:null;
  }
  return null;
}

/** The subscription's units or a generic subscription.paid event is NOT proof
 * that the *extra* seats were paid for. Match a fresh paid transaction instead.
 */
export function matchesPaidSeatIncrease(
  change:PendingSeatIncrease,
  latestSubscription:any,
  rawTransaction:any,
  mode:'test'|'prod',
):boolean {
  const sub=latestSubscription?.subscription??latestSubscription;
  const tx=rawTransaction?.transaction??rawTransaction;
  if(!Number.isSafeInteger(change.previous_seats)||!Number.isSafeInteger(change.desired_seats)||
     change.desired_seats<=change.previous_seats ||
     !change.previous_transaction_id || !/^tran_[A-Za-z0-9_-]+$/.test(change.previous_transaction_id))return false;
  if(sub?.id!==change.subscription_id || sub?.mode!==mode || sub?.status!=='active' ||
     !Array.isArray(sub?.items) || sub.items.length!==1 ||
     Number(sub.items[0]?.units)!==change.desired_seats)return false;
  const last=sub?.last_transaction_id;
  if(typeof last!=='string'||!/^tran_[A-Za-z0-9_-]+$/.test(last)||
     last===change.previous_transaction_id || tx?.id!==last ||
     tx?.mode!==mode || tx?.status!=='paid')return false;
  const txSub=typeof tx?.subscription==='string'?tx.subscription:tx?.subscription?.id;
  if(txSub!==change.subscription_id)return false;
  // Paid amount in minor currency units; a $0 invoice should not unlock seats.
  if(!Number.isFinite(Number(tx?.amount_paid))||Number(tx.amount_paid)<=0)return false;
  const requested=asTimestamp(change.created_at);
  const charged=asTimestamp(tx.created_at);
  if(requested===null||charged===null||charged<requested-60000)return false;
  return true;
}

export async function verifyCreemSeatIncreasePayment(
 config:CreemConfig,change:PendingSeatIncrease
):Promise<boolean> {
 if(!change.previous_transaction_id) return false;
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
