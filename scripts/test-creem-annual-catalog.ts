import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { actiprocPriceUsd, billingIntervalForPlan, creemPeriodForInterval } from '../lib/billing-plans';
import { getCreemConfig, creemProductForPlan, creemPlanForProduct, creemIntervalForProduct } from '../lib/creem-config';
import { normalizeCreemSubscription } from '../lib/creem-subscription-contract';
const env={
 NODE_ENV:'development',VERCEL_ENV:'preview',CREEM_MODE:'test',
 CREEM_API_KEY:'test-only',CREEM_WEBHOOK_SECRET:'fake-for-unit-only',
 CREEM_PRODUCT_INDIVIDUAL:'prod_individual01',
 CREEM_PRODUCT_PRO:'prod_promonth01',
 CREEM_PRODUCT_PRO_YEARLY:'prod_proyear01',
 CREEM_PRODUCT_TEAM:'prod_teammonth01',
 CREEM_PRODUCT_TEAM_YEARLY:'prod_teamyear01',
} as NodeJS.ProcessEnv;
const config=getCreemConfig(env);
const combos=[
 ['individual','yearly',12,'prod_individual01'],
 ['pro','monthly',4,'prod_promonth01'],
 ['pro','yearly',40,'prod_proyear01'],
 ['team','monthly',6,'prod_teammonth01'],
 ['team','yearly',60,'prod_teamyear01'],
] as const;
for(const [plan,interval,price,id] of combos){
 assert.equal(actiprocPriceUsd(plan,interval),price);
 assert.equal(creemProductForPlan(plan,config,interval),id);
 assert.equal(creemPlanForProduct(id,config),plan);
 assert.equal(creemIntervalForProduct(id,config),interval);
 assert.equal(creemPeriodForInterval(interval),interval==='yearly'?'every-year':'every-month');
 const raw={
  id:'sub_paid123',mode:'test',customer:'cust_paid123',product:id,
  status:'active',items:[{product_id:id,units:plan==='individual'?1:3}],
  updated_at:'2026-11-07T00:00:00Z',current_period_end_date:'2027-11-07T00:00:00Z',
 };
 const decoded=normalizeCreemSubscription(raw,config);
 assert.equal(decoded.plan,plan);
 assert.equal(decoded.billingInterval,interval);
 assert.equal(decoded.productId,id);
}
assert.equal(billingIntervalForPlan('individual','monthly'),'yearly');
assert.equal(creemPlanForProduct('prod_unknown01',config),null);
assert.equal(creemIntervalForProduct('prod_unknown01',config),null);
for(const key of ['CREEM_PRODUCT_PRO_YEARLY','CREEM_PRODUCT_TEAM_YEARLY'] as const){
 assert.throws(()=>getCreemConfig({...env,[key]:'prod_promonth01'}));
}
const paths=[
 'app/api/webhooks/creem/route.ts','lib/creem-billing-operations.ts',
 'app/api/billing/summary/route.ts','components/billing/BillingClient.tsx',
 'hooks/useOrganizationBilling.ts','components/billing/UpgradePlanModal.tsx',
 'components/marketing/sections/MarketingPricing.tsx',
];
const source=paths.map(p=>readFileSync(p,'utf8'));
assert.match(source[0],/checkoutProductId===selectedProductId/);
assert.match(source[0],/creemIntervalForProduct\(selectedProductId,config\)===selectedInterval/);
assert.ok(source[1].indexOf('.update({product_id:productId,billing_interval:interval})') <
 source[1].indexOf("'POST','checkouts'"));
assert.match(source[1],/const targetProduct=creemProductForPlan\(plan,config,activeInterval\)/);
assert.match(source[2],/billingInterval=creemIntervalForProduct\(productId,config\)/);
assert.match(source[3],/selectedBillingInterval/);
assert.match(source[4],/setBillingInterval/);
assert.match(source[5],/billingInterval/);
assert.match(source[6],/actiprocPriceUsd/);
const migration=readFileSync('supabase/migrations/20261107173000_creem_annual_product_intents.sql','utf8');
assert.ok(migration.includes('billing_interval TEXT')&&migration.includes('product_id TEXT'));
console.log(JSON.stringify({catalogProducts:5,annualProducts:2,scope:'synthetic-test',paymentCalls:0,liveChanges:false}));
