/** Provider-authenticated proof that a paid invoice belongs to this mutation.
 * Fail closed for transactions not adjacent to the requested immediate charge.
 * A subscription.paid event alone (including normal renewals) never proves payment.
 */
export type CreemPaidMutation = {
 subscription_id:string;
 previous_transaction_id:string|null;
 created_at:string;
};
export function creemTimestamp(value:unknown):number|null {
 if(typeof value==='number'&&Number.isFinite(value)&&value>=0) {
  const ms=value<1e11?value*1000:value;
  return Number.isFinite(ms)?ms:null;
 }
 if(typeof value==='string'&&value.trim()) {
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?parsed:null;
 }
 return null;
}
function idOf(value:unknown):string|null {
 if(typeof value==='string')return value;
 return value&&typeof value==='object'&&typeof (value as any).id==='string'
   ? (value as any).id:null;
}
/** Creem charges for immediate subscription updates should occur near the API
 * request, not at some unrelated future renewal. Older or late invoices require
 * manual review, never automatic entitlement escalation.
 */
export const CREEM_IMMEDIATE_CHARGE_WINDOW_MS=20*60_000;
export function matchesFreshPaidCreemTransaction(
 change:CreemPaidMutation,
 rawSubscription:any,
 rawTransaction:any,
 mode:'test'|'prod'
):boolean {
 const sub=rawSubscription?.subscription??rawSubscription;
 const tx=rawTransaction?.transaction??rawTransaction;
 const baseline=change.previous_transaction_id;
 if(sub?.id!==change.subscription_id || sub?.mode!==mode || sub?.status!=='active' ||
   typeof baseline!=='string'||!/^tran_[A-Za-z0-9_-]+$/.test(baseline)) return false;
 const latest=sub?.last_transaction_id;
 if(typeof latest!=='string'||!/^tran_[A-Za-z0-9_-]+$/.test(latest)||
    latest===baseline||tx?.id!==latest||tx?.mode!==mode||tx?.status!=='paid')return false;
 if(idOf(tx.subscription)!==change.subscription_id ||
    !idOf(sub.customer) || idOf(tx.customer)!==idOf(sub.customer))return false;
 // This product only sells recurring USD SaaS subscriptions.
 if(tx.type!=='invoice'||tx.currency!=='USD'||
    !Number.isSafeInteger(tx.amount_paid)||tx.amount_paid<=0 ||
    (tx.refunded_amount!==null&&tx.refunded_amount!==undefined&&tx.refunded_amount!==0))
   return false;
 const requested=creemTimestamp(change.created_at),paidAt=creemTimestamp(tx.created_at);
 if(requested===null||paidAt===null||paidAt<requested-60_000||
    paidAt>requested+CREEM_IMMEDIATE_CHARGE_WINDOW_MS)return false;
 return true;
}
