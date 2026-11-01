import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACTIPROC_PLANS, CREEM_EXPECTED_TAX_MODE } from '../lib/billing-plans';
import { getCreemConfig, creemPlanForProduct, creemResponseMode } from '../lib/creem-config';
import { normalizeCreemSubscription } from '../lib/creem-subscription-contract';

assert.deepEqual([ACTIPROC_PLANS.free.maxProcesses,ACTIPROC_PLANS.individual.maxProcesses,ACTIPROC_PLANS.pro.maxProcesses],[1,3,10]);
assert.deepEqual([ACTIPROC_PLANS.individual.priceUsd,ACTIPROC_PLANS.pro.priceUsd,ACTIPROC_PLANS.team.priceUsd],[12,4,6]);
assert.equal(CREEM_EXPECTED_TAX_MODE, 'inclusive');
const env = {
 NODE_ENV: 'development', VERCEL_ENV: 'preview', CREEM_MODE:'test',
 CREEM_API_KEY:'test-only-not-real', CREEM_WEBHOOK_SECRET:'webhook-test-only',
 CREEM_PRODUCT_INDIVIDUAL:'prod_individual123',CREEM_PRODUCT_PRO:'prod_pro123',CREEM_PRODUCT_TEAM:'prod_team123',
} as NodeJS.ProcessEnv;
const config=getCreemConfig(env);
assert.equal(config.baseUrl,'https://test-api.creem.io');
assert.equal(creemResponseMode(config),'test');
assert.equal(creemResponseMode({...config,mode:'live'}),'prod');
assert.equal(creemPlanForProduct('prod_team123',config),'team');
assert.equal(creemPlanForProduct('prod_wrong',config),null);
assert.throws(()=>getCreemConfig({...env,VERCEL_ENV:'production'}));
assert.throws(()=>getCreemConfig({...env,CREEM_MODE:'live'}));
assert.throws(()=>getCreemConfig({...env,CREEM_PRODUCT_TEAM:'prod_pro123'}));
const raw = {
 id:'sub_abc123',mode:'test',customer:{id:'cust_abc123'},product:{id:'prod_pro123'},
 status:'active',items:[{id:'sitem_abc',units:3}],
 updated_at:'2026-11-01T00:00:00Z',current_period_end_date:'2026-12-01T00:00:00Z',
};
const snapshot=normalizeCreemSubscription(raw,config);
assert.equal(snapshot.plan,'pro'); assert.equal(snapshot.seats,3); assert.equal(snapshot.status,'active');
assert.equal(normalizeCreemSubscription({...raw,status:'unpaid'},config).status,'past_due');
assert.equal(normalizeCreemSubscription({...raw,status:'past_due'},config).status,'past_due');
assert.equal(normalizeCreemSubscription({...raw,status:'expired'},config).status,'expired');
assert.equal(normalizeCreemSubscription({...raw,status:'scheduled_cancel'},config).status,'cancelled');
assert.equal(normalizeCreemSubscription({...raw,status:'canceled',current_period_end_date:'2000-01-01'},config).status,'expired');
for (const bad of [
 {...raw,mode:'live'}, {...raw,items:[{id:'sitem',units:0}]},
 {...raw,product:{id:'prod_unexpected'}}, {...raw,updated_at:null},
 {...raw,status:'mystery'}, {...raw,customer:null},
 {...raw,product:{id:'prod_individual123'},items:[{id:'sitem',units:2}]},
]) assert.throws(()=>normalizeCreemSubscription(bad,config));
const sql=fs.readFileSync('supabase/migrations/20261101110000_creem_parallel_billing.sql','utf8');
for(const required of ['creem_payment_hold','claim_creem_event','apply_creem_subscription_snapshot','ls_subscription_id IS NULL','creem_checkout_intents','creem_webhook_events'])
 assert.ok(sql.includes(required),'Missing migration guard '+required);
const checkout=fs.readFileSync('app/api/billing/checkout/route.ts','utf8');
assert.ok(checkout.includes("platformCookie === 'android-twa'"),'Android TWA checkout block missing');
assert.ok(checkout.includes("newBillingProvider() === 'creem'"),'Creem not isolated from legacy checkout');
assert.ok(checkout.includes("requestedBody?.plan === 'individual'"),'Legacy Lemon Individual must fail closed');
const checkoutOperation=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
assert.ok(checkoutOperation.includes('product.tax_mode!==CREEM_EXPECTED_TAX_MODE'),'Checkout must match configured Creem tax mode');
const verifier=fs.readFileSync('scripts/verify-creem-products.ts','utf8');
assert.ok(verifier.includes("expect('tax_mode',CREEM_EXPECTED_TAX_MODE"),'Preflight must match checkout tax mode');
const webhook=fs.readFileSync('app/api/webhooks/creem/route.ts','utf8');
assert.ok(webhook.includes("timingSafeEqual"),'Missing webhook timing-safe verification');
assert.ok(webhook.includes("checkout.completed") && webhook.includes("hold_creem_subscription"));
for (const event of ['subscription.past_due','subscription.unpaid','subscription.scheduled_cancel'])
 assert.ok(webhook.includes(event), 'Missing Creem lifecycle event ' + event);
const lemon = fs.readFileSync('lib/lemon-subscription.ts','utf8');
assert.ok(lemon.includes("organization?.billing_provider === 'creem'"),'Late Lemon webhooks must not overwrite Creem');
console.log('Creem billing contract checks passed');

const bootstrap = fs.readFileSync('scripts/bootstrap-staging-db.mjs','utf8');
assert.ok(bootstrap.includes("['20261101110000', 'creem_parallel_billing'"), 'Creem staging migration must be tracked');
assert.ok(bootstrap.includes('pendingMigrations: pending.map('), 'Read-only staging check must list migration names');

const inspection=fs.readFileSync('scripts/inspect-staging-billing.mjs','utf8');
assert.ok(inspection.includes("BEGIN READ ONLY"),'Billing audit must be read-only');
assert.ok(inspection.includes('creem_webhook_events') && inspection.includes('claim_creem_event'),'Billing audit must check Creem storage and RPC');
