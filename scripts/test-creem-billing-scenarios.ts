import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchesPaidSeatIncrease,verifyCreemSeatIncreasePayment } from '../lib/creem-seat-payment';
import { matchesPaidPlanUpgrade,verifyCreemPlanUpgradePayment } from '../lib/creem-plan-payment';
import { CREEM_IMMEDIATE_CHARGE_WINDOW_MS } from '../lib/creem-paid-mutation';
import { getCreemConfig } from '../lib/creem-config';

const at=Date.parse('2026-11-01T18:00:15Z');
const requested='2026-11-01T18:00:00.000Z';
const config=getCreemConfig({
 CREEM_MODE:'test',CREEM_API_KEY:'test-in-memory-only',
 CREEM_WEBHOOK_SECRET:'test-webhook-secret-only-not-real',
 CREEM_PRODUCT_INDIVIDUAL:'prod_individual123',
 CREEM_PRODUCT_PRO:'prod_pro123',CREEM_PRODUCT_TEAM:'prod_team123',
 VERCEL_ENV:'preview',
} as unknown as NodeJS.ProcessEnv);
const subBase={
 id:'sub_scenario',mode:'test',status:'active',
 customer:{id:'cust_scenario'},last_transaction_id:'tran_current',
 product:'prod_team123',
 items:[{id:'sitem_example',product_id:'prod_team123',units:5}]
};
const paid={
 id:'tran_current',mode:'test',type:'invoice',status:'paid',
 subscription:'sub_scenario',customer:'cust_scenario',
 amount_paid:1000,refunded_amount:null,currency:'USD',created_at:at
};
const change={
 subscription_id:'sub_scenario',previous_transaction_id:'tran_original',
 created_at:requested,previous_seats:3,desired_seats:5
};
const upgrade={
 subscription_id:'sub_scenario',previous_transaction_id:'tran_original',
 created_at:requested,previous_plan:'pro' as const,desired_plan:'team' as const,
 previous_product_id:'prod_pro123',desired_product_id:'prod_team123',
 previous_seats:5,customer_id:'cust_scenario'
};
assert.equal(matchesPaidSeatIncrease(change,subBase,paid,'test'),true);
assert.equal(matchesPaidPlanUpgrade(upgrade,subBase,paid,'test'),true);
const invalidInvoices: [string,any,any][]=[
 ['old transaction',subBase,{...paid,id:'tran_original'}],
 ['transaction mismatch',{...subBase,last_transaction_id:'tran_unrelated'},paid],
 ['renewal outside mutation window',subBase,{...paid,created_at:at+CREEM_IMMEDIATE_CHARGE_WINDOW_MS+10_000}],
 ['charge before request',subBase,{...paid,created_at:at-100_000}],
 ['no charge',subBase,{...paid,amount_paid:0}],
 ['refund',subBase,{...paid,status:'refunded'}],
 ['partial refund',subBase,{...paid,refunded_amount:100}],
 ['chargeback',subBase,{...paid,status:'chargeback'}],
 ['unpaid',subBase,{...paid,status:'pending'}],
 ['wrong customer',subBase,{...paid,customer:'cust_another'}],
 ['wrong subscription',subBase,{...paid,subscription:'sub_another'}],
 ['wrong currency',subBase,{...paid,currency:'EUR'}],
 ['wrong mode',subBase,{...paid,mode:'prod'}],
 ['wrong transaction type',subBase,{...paid,type:'payment'}],
 ['wrong subscription state',{...subBase,status:'past_due'},paid],
];
for(const [label,sub,tx] of invalidInvoices){
 assert.equal(matchesPaidSeatIncrease(change,sub,tx,'test'),false,'Seat: '+label);
 assert.equal(matchesPaidPlanUpgrade(upgrade,sub,tx,'test'),false,'Plan: '+label);
}
for(const [label,sub] of [
 ['wrong upgraded product',{...subBase,product:'prod_pro123'}],
 ['wrong member quantity',{...subBase,items:[{units:3}]}],
 ['wrong subscription customer',{...subBase,customer:'cust_other'}],
]){
 assert.equal(matchesPaidPlanUpgrade(upgrade,sub,paid,'test'),false,'Plan: '+label);
}
async function runProviderScenarios():Promise<void>{
const originalFetch=globalThis.fetch;
let calls:string[]=[];
try {
 const remoteReplies:Map<string,any>=new Map<string,any>([
  ['subscriptions?subscription_id=sub_scenario',subBase],
  ['transactions?transaction_id=tran_current',paid],
 ]);
 globalThis.fetch=(async (input:RequestInfo|URL,init?:RequestInit) => {
   const full=String(input),path=full.split('/v1/')[1];calls.push(path);
   const reply=remoteReplies.get(path);
   return new Response(reply?JSON.stringify(reply):JSON.stringify({error:'missing'}),{
     status:reply?200:404,headers:{'Content-Type':'application/json'}
   });
 }) as typeof fetch;
 assert.equal(await verifyCreemSeatIncreasePayment(config,change),true);
 assert.equal(await verifyCreemPlanUpgradePayment(config,upgrade),true);
 assert.deepEqual(calls,[
  'subscriptions?subscription_id=sub_scenario','transactions?transaction_id=tran_current',
  'subscriptions?subscription_id=sub_scenario','transactions?transaction_id=tran_current',
 ]);
 calls=[];
 remoteReplies.set('transactions?transaction_id=tran_current',{...paid,status:'unpaid'});
 assert.equal(await verifyCreemSeatIncreasePayment(config,change),false);
 assert.equal(await verifyCreemPlanUpgradePayment(config,upgrade),false);
}finally {globalThis.fetch=originalFetch;}
const sql=fs.readFileSync('supabase/migrations/20261101220000_creem_plan_change_safety.sql','utf8');
for(const item of [
 'CREATE TABLE IF NOT EXISTS public.creem_plan_changes',
 'uq_creem_plan_changes_open','reserve_creem_plan_change',
 'transition_creem_plan_change','confirm_creem_plan_change',
 'FOR UPDATE','FROM public.creem_seat_changes','FROM public.creem_plan_changes',
 'GRANT EXECUTE ON FUNCTION public.reserve_creem_plan_change',
])assert.ok(sql.includes(item),'Missing plan SQL safety contract: '+item);
const operations=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
const entitlements=fs.readFileSync('lib/entitlements.ts','utf8');
const webhook=fs.readFileSync('app/api/webhooks/creem/route.ts','utf8');
const settlement=fs.readFileSync('lib/creem-plan-settlement.ts','utf8');
assert.ok(operations.includes('CREEM_PLAN_MUTATIONS_ENABLED')&&
 operations.includes("rpc('reserve_creem_plan_change'")&&
 operations.includes("rpc('transition_creem_plan_change'")&&
 operations.includes('reconcilePendingCreemPlanChange'));
assert.ok(entitlements.includes("from('creem_plan_changes')")&&
 entitlements.includes('plan=normalizePlan(pending.previous_plan)')&&
 entitlements.includes("plan='free'"));
assert.ok(webhook.includes('reconcilePendingCreemPlanChange')&&
 settlement.includes('verifyCreemPlanUpgradePayment')&&
 settlement.includes("rpc('confirm_creem_plan_change'"));
console.log('PASS: 3->5 and plan upgrade, 15 rejected invoice scenarios, mocked provider GET, cross-mutation SQL, entitlement guards');

}
runProviderScenarios().catch(error=>{console.error(error);process.exitCode=1;});
