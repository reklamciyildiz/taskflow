import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACTIPROC_PLANS, CREEM_EXPECTED_TAX_MODE, actiprocPriceUsd } from '../lib/billing-plans';
import { assertCreemLiveReturnOrigin, getCreemConfig, creemPlanForProduct, creemProductForPlan, creemIntervalForProduct, creemResponseMode, creemCheckoutEnvironmentSafe } from '../lib/creem-config';
import { normalizeCreemSubscription } from '../lib/creem-subscription-contract';
import { validCreemEventId, verifyCreemSignature, paidCreemCheckoutMatches } from '../lib/creem-webhook-contract';
import crypto from 'node:crypto';
import { isPaidActive } from '../lib/subscription-access';
import { creemResumeEligibility } from '../lib/creem-lifecycle';
import { parseCreemSeatState, seatUpdatePayload, SeatValidationError } from '../lib/creem-seats';
import { matchesPaidSeatIncrease } from '../lib/creem-seat-payment';
import { issueBillingConsent, verifyBillingConsent, type BillingConsentState } from '../lib/creem-billing-consent';
import { readCreemBillingCycle, creemUtcDate, CREEM_IMMEDIATE_CYCLE_POLICY } from '../lib/creem-billing-cycle';

assert.deepEqual([ACTIPROC_PLANS.free.maxProcesses,ACTIPROC_PLANS.individual.maxProcesses,ACTIPROC_PLANS.pro.maxProcesses],[1,3,10]);
assert.deepEqual([ACTIPROC_PLANS.individual.priceUsd,ACTIPROC_PLANS.pro.priceUsd,ACTIPROC_PLANS.team.priceUsd],[12,4,6]);
assert.equal(CREEM_EXPECTED_TAX_MODE, 'inclusive');
assert.deepEqual([
  actiprocPriceUsd('individual','yearly'),actiprocPriceUsd('pro','monthly'),
  actiprocPriceUsd('pro','yearly'),actiprocPriceUsd('team','monthly'),
  actiprocPriceUsd('team','yearly')
],[12,4,40,6,60]);
const env = {
 NODE_ENV: 'development', VERCEL_ENV: 'preview', CREEM_MODE:'test',
 CREEM_API_KEY:'test-only-not-real', CREEM_WEBHOOK_SECRET:'webhook-test-only',
 CREEM_PRODUCT_INDIVIDUAL:'prod_individual123',CREEM_PRODUCT_PRO:'prod_pro123',CREEM_PRODUCT_TEAM:'prod_team123',
 CREEM_PRODUCT_PRO_YEARLY:'prod_proyear123',CREEM_PRODUCT_TEAM_YEARLY:'prod_teamyear123',
} as NodeJS.ProcessEnv;
const config=getCreemConfig(env);
assert.equal(config.baseUrl,'https://test-api.creem.io');
assert.equal(creemResponseMode(config),'test');
assert.equal(creemResponseMode({...config,mode:'live'}),'prod');
assert.doesNotThrow(()=>assertCreemLiveReturnOrigin('https://www.actiproc.com'));
assert.doesNotThrow(()=>assertCreemLiveReturnOrigin('https://actiproc.com/'));
for(const badReturn of [
 'http://actiproc.com','https://localhost:3000','https://staging.actiproc.com',
 'https://actiproc.com.attacker.example','https://actiproc.com@evil.example',
 'https://www.actiproc.com/redirect','https://www.actiproc.com/?next=bad'
]) assert.throws(()=>assertCreemLiveReturnOrigin(badReturn));
assert.throws(()=>getCreemConfig({...env,VERCEL_ENV:'production',CREEM_MODE:'live',
 CREEM_API_KEY:'creem_test_wrong_mode'}));
const modernInvite=fs.readFileSync('components/InviteMemberModal.tsx','utf8');
const modernSettings=fs.readFileSync('components/Settings.tsx','utf8');
const modernTerms=fs.readFileSync('app/(marketing)/terms/page.tsx','utf8');
const modernUpgrade=fs.readFileSync('components/billing/UpgradePlanModal.tsx','utf8');
assert.doesNotMatch(modernInvite,/LemonSqueezy|lemonsqueezy.com|lemon\.js/);
assert.match(modernInvite,/\/settings\/billing\?plan=team/);
assert.doesNotMatch(modernSettings,/Lemon Squeezy/);
assert.doesNotMatch(modernTerms,/Lemon Squeezy/);
assert.match(modernUpgrade,/plans.length === 1/);
assert.doesNotMatch(modernUpgrade,/AI may remain beta-only|\/api\/billing\/switch-plan/);
const liveProducts=fs.readFileSync('scripts/verify-creem-live-products.ts','utf8');
const launchSql=fs.readFileSync('scripts/sql/creem-production-readiness.sql','utf8');
assert.match(liveProducts,/'GET'/);
assert.doesNotMatch(liveProducts,/'POST'/);
assert.match(launchSql,/BEGIN READ ONLY/);
assert.match(launchSql,/creem_test_mode/);
assert.equal(creemPlanForProduct('prod_team123',config),'team');
assert.equal(creemPlanForProduct('prod_proyear123',config),'pro');
assert.equal(creemPlanForProduct('prod_teamyear123',config),'team');
assert.equal(creemIntervalForProduct('prod_proyear123',config),'yearly');
assert.equal(creemIntervalForProduct('prod_team123',config),'monthly');
assert.equal(creemProductForPlan('pro',config,'yearly'),'prod_proyear123');
assert.equal(creemProductForPlan('team',config,'yearly'),'prod_teamyear123');
assert.equal(creemProductForPlan('individual',config,'yearly'),'prod_individual123');
assert.throws(()=>getCreemConfig({...env,CREEM_PRODUCT_TEAM_YEARLY:'prod_pro123'}));
assert.throws(()=>creemProductForPlan('team',getCreemConfig({...env,CREEM_PRODUCT_TEAM_YEARLY:''}),'yearly'));
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
assert.ok(checkout.includes("request.cookies.get('actiproc_platform')?.value === 'capacitor-native'"),'Native Capacitor checkout block missing');
assert.ok(checkout.includes('creemCheckoutEnvironmentSafe()'),'Checkout gate required');
assert.equal(creemCheckoutEnvironmentSafe({...env,CREEM_CHECKOUT_ENABLED:'true',AXIOM_STAGING_SUPABASE_PROJECT_REF:'staging123',NEXT_PUBLIC_SUPABASE_URL:'https://staging123.supabase.co'}),true);
assert.equal(creemCheckoutEnvironmentSafe({...env,CREEM_CHECKOUT_ENABLED:'true'}),false);
assert.equal(creemCheckoutEnvironmentSafe({...env,VERCEL_ENV:'production',CREEM_MODE:'test',CREEM_CHECKOUT_ENABLED:'true'}),false);
assert.equal(creemCheckoutEnvironmentSafe({...env,VERCEL_ENV:'production',CREEM_MODE:'live',CREEM_CHECKOUT_ENABLED:'true'}),true);
assert.equal(creemCheckoutEnvironmentSafe({...env,VERCEL_ENV:'production',CREEM_MODE:'live'}),false);
const checkoutOperation=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
assert.ok(checkoutOperation.includes('product.tax_mode!==CREEM_EXPECTED_TAX_MODE'),'Checkout must match configured Creem tax mode');
const verifier=fs.readFileSync('scripts/verify-creem-products.ts','utf8');
assert.ok(verifier.includes("expect('tax_mode',CREEM_EXPECTED_TAX_MODE"),'Preflight must match checkout tax mode');
const webhook=fs.readFileSync('app/api/webhooks/creem/route.ts','utf8');
const webhookContract=fs.readFileSync('lib/creem-webhook-contract.ts','utf8');
assert.ok(webhook.includes('verifyCreemSignature') && webhookContract.includes('timingSafeEqual'),
 'Missing webhook timing-safe verification');
assert.ok(webhook.includes("checkout.completed") && webhook.includes("hold_creem_subscription"));
for (const event of ['subscription.past_due','subscription.unpaid','subscription.scheduled_cancel'])
 assert.ok(webhook.includes(event), 'Missing Creem lifecycle event ' + event);
assert.ok(!checkout.includes('lemonsqueezy.com'),'No Lemon checkout API');
console.log('Creem billing contract checks passed');

const bootstrap = fs.readFileSync('scripts/bootstrap-staging-db.mjs','utf8');
assert.ok(bootstrap.includes("['20261101110000', 'creem_parallel_billing'"), 'Creem staging migration must be tracked');
assert.ok(bootstrap.includes('pendingMigrations: pending.map('), 'Read-only staging check must list migration names');

const inspection=fs.readFileSync('scripts/inspect-staging-billing.mjs','utf8');
assert.ok(inspection.includes("BEGIN READ ONLY"),'Billing audit must be read-only');
assert.ok(inspection.includes('creem_webhook_events') && inspection.includes('claim_creem_event'),'Billing audit must check Creem storage and RPC');

const dashboardProbe=fs.readFileSync('scripts/inspect-staging-billing.mjs','utf8');
assert.ok(dashboardProbe.includes('stagingSqlEditor:') && dashboardProbe.includes("to_regclass('public.creem_checkout_intents')"), 'Staging inspection must check actual connected database and point to the configured staging SQL editor');

const examplePayload='{"id":"evt_test_123","eventType":"checkout.completed"}';
const validSignature=crypto.createHmac('sha256','local-secret-only').update(examplePayload).digest('hex');
assert.equal(verifyCreemSignature(examplePayload,validSignature,'local-secret-only'),true);
assert.equal(verifyCreemSignature(examplePayload+' ',validSignature,'local-secret-only'),false);
assert.equal(verifyCreemSignature(examplePayload,null,'local-secret-only'),false);
assert.equal(verifyCreemSignature(examplePayload,'invalid','local-secret-only'),false);
assert.equal(validCreemEventId('evt_alpha-123_ABC'),true);
assert.equal(validCreemEventId('evt_'),false);
assert.equal(validCreemEventId('other_fake'),false);
const validCheckout={id:'ch_good',request_id:'our-uuid',mode:'test',status:'completed',
  order:{status:'paid'},product:{id:'prod_pro123'},units:3};
const expectedCheckout={checkoutId:'ch_good',requestId:'our-uuid',mode:'test' as const,productId:'prod_pro123',seats:3};
assert.equal(paidCreemCheckoutMatches(validCheckout,expectedCheckout),true);
for(const bad of [
  {...validCheckout,mode:'prod'}, {...validCheckout,status:'pending'},
  {...validCheckout,order:{status:'unpaid'}}, {...validCheckout,units:4},
  {...validCheckout,product:'prod_wrong'}, {...validCheckout,request_id:'other'}
]) assert.equal(paidCreemCheckoutMatches(bad,expectedCheckout),false);
const operationSource=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
assert.ok(operationSource.includes('org?.creem_payment_hold'),'A payment hold must block new checkout');
assert.ok(operationSource.includes('.update({product_id:productId,billing_interval:interval})'),
  'Checkout must persist exact authorized product and cadence before external payment');
assert.ok(operationSource.includes('org?.creem_subscription_id'),'An expired linked subscription must block duplicate checkout');
assert.ok(webhook.includes('if(intent.fulfilled_at)') && webhook.includes('creem_subscription_id!==sid'),
 'A previously fulfilled checkout must be safely acknowledged after verifying the same subscription');

const future='2099-01-01T00:00:00.000Z';
assert.equal(isPaidActive('active',future),true);
assert.equal(isPaidActive('active','2020-01-01T00:00:00.000Z'),false);
assert.equal(isPaidActive('active','not-a-date'),false);
assert.equal(isPaidActive('active',null),true); // Legacy manually granted account without term.
assert.equal(isPaidActive('cancelled',future),true);
assert.equal(isPaidActive('cancelled',null),false);
assert.equal(isPaidActive('past_due',future),false);
assert.equal(isPaidActive('paused',future),false);
assert.equal(isPaidActive('expired',future),false);

// Opt-in primary Supabase tests: one main branch, one .env.local, no staging required.
// The primary DB override is forbidden in any Vercel environment.
const primary = {
  ...env, VERCEL_ENV: undefined, NODE_ENV: 'development',
  NEXTAUTH_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'https://primaryproject123.supabase.co',
  CREEM_MODE:'test', CREEM_CHECKOUT_ENABLED:'true', CREEM_TEST_ON_PRIMARY_DB:'true',
} as NodeJS.ProcessEnv;
assert.equal(creemCheckoutEnvironmentSafe(primary),true);
assert.equal(creemCheckoutEnvironmentSafe({...primary,CREEM_TEST_ON_PRIMARY_DB:'false'}),false);
assert.equal(creemCheckoutEnvironmentSafe({...primary,NEXTAUTH_URL:'https://www.actiproc.com'}),false);
assert.equal(creemCheckoutEnvironmentSafe({...primary,VERCEL_ENV:'preview'}),false);
assert.equal(creemCheckoutEnvironmentSafe({...primary,VERCEL_ENV:'production'}),false);
assert.equal(creemCheckoutEnvironmentSafe({...primary,NODE_ENV:'production'}),false);
assert.equal(creemCheckoutEnvironmentSafe({...primary,NEXT_PUBLIC_SUPABASE_URL:'https://malicious.example'}),false);
assert.equal(creemCheckoutEnvironmentSafe({...primary,CREEM_CHECKOUT_ENABLED:'false'}),false);

const billingUi=fs.readFileSync('components/billing/BillingClient.tsx','utf8');
assert.ok(billingUi.includes('canUpgrade') && billingUi.includes('hasPaidSubscription'),'Cancelled plans must block unsupported plan upgrades');
assert.ok(!billingUi.includes('Checkout returned — verifying subscription payment'),'Stale checkout banner must be removed');
assert.ok(billingUi.includes('setSelectedBillingInterval('),'Billing UI must offer annual/monthly selection');
assert.ok(billingUi.includes('billingReview.billingInterval'),'Review must respect verified cadence');
assert.ok(billingUi.includes('Secured by Creem') && billingUi.includes('Choose how your team grows'),'Billing dashboard design missing');

const cases = {
  scheduled_cancel:'resume',
  paused:'resume',
  canceled:'terminal',
  expired:'terminal',
  active:'already-active',
  trialing:'already-active',
  unpaid:'blocked',
  past_due:'blocked',
  unknown:'blocked',
} as const;
for (const [remoteStatus,expected] of Object.entries(cases))
  assert.equal(creemResumeEligibility(remoteStatus),expected,'Creem resume eligibility for '+remoteStatus);
const resumeRoute=fs.readFileSync('app/api/billing/resume/route.ts','utf8');
assert.ok(resumeRoute.includes('requireOrgAdmin') && resumeRoute.includes('resumeCreemBilling'),'Resume must be admin-authorized');
assert.ok(resumeRoute.includes('capacitor-native'),'Resume must block native app payment changes');
const operations=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
assert.ok(operations.includes('creemResumeEligibility') && operations.includes("creem_payment_hold"),'Resume must check Creem state and payment holds');
assert.ok(operations.includes("+'/resume'") && operations.includes('reconcileCreemSubscription(orgId,org.creem_subscription_id,config)'),
  'Resume must call Creem and refresh authoritative subscription');
const hookCode=fs.readFileSync('hooks/useOrganizationBilling.ts','utf8');
const clientCode=fs.readFileSync('components/billing/BillingClient.tsx','utf8');
assert.ok(hookCode.includes("fetch('/api/billing/resume'") && clientCode.includes('resumeSubscription()'), 'Resume action must be wired to Billing UI');
assert.ok(clientCode.includes('canResume && hasPaidSubscription'), 'Resume action must require verified remote eligibility');
assert.ok(clientCode.includes('Not available after cancellation'), 'Cancelled-plan pricing must not promise an impossible resume');
assert.ok(!clientCode.includes('Select <strong>Resume billing</strong>'), 'Never direct terminal subscriptions to an unsupported resume action');
assert.ok(hookCode.includes("fetch('/api/billing/resume',{cache:'no-store'})"), 'The resume check must be read-only and fetched from Creem');

const resumeServer=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
assert.ok(resumeRoute.includes('export async function GET') && resumeRoute.includes('getCreemResumeAvailability'), 'Resume eligibility must be checked via authenticated read-only endpoint');
assert.ok(resumeServer.includes("creemResumeEligibility(remoteStatus)==='resume'"), 'Only remotely resumable statuses may show the action');
assert.ok(resumeServer.includes("customerId===org.creem_customer_id") && resumeServer.includes("productId===org.creem_product_id"), 'Remote eligibility must verify ownership and product');

const nativeCheckout=fs.readFileSync('app/api/billing/checkout/route.ts','utf8');
assert.ok(nativeCheckout.includes('capacitor-native'),'Capacitor native app must not start Creem checkout');

const reSql=fs.readFileSync('supabase/migrations/20261101170000_creem_safe_resubscription.sql','utf8');
const webhookRe=fs.readFileSync('app/api/webhooks/creem/route.ts','utf8');
const checkoutRe=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
assert.ok(reSql.includes('CREATE OR REPLACE FUNCTION public.reserve_creem_resubscription') &&
 reSql.includes('FOR UPDATE'), 'Replacement checkout must reserve atomically');
assert.ok(reSql.includes('CREATE OR REPLACE FUNCTION public.apply_creem_resubscription') &&
 reSql.includes('creem_subscription_history') &&
 reSql.includes('fulfilled_at=NOW()'), 'Paid replacement must update plan + checkout completion in one transaction');
assert.ok(reSql.includes('REVOKE ALL ON FUNCTION public.apply_creem_resubscription') &&
 reSql.includes('TO service_role'), 'Replacement RPC must be server only');
assert.ok(checkoutRe.includes("CREEM_RESUBSCRIPTION_ENABLED") &&
 checkoutRe.includes("payload?.acceptNewCharge") &&
 checkoutRe.includes("['canceled','expired']"), 'Re-subscription must require explicit consent + terminal Creem state');
assert.ok(webhookRe.includes('intent.previous_subscription_id') &&
 webhookRe.includes("rpc('apply_creem_resubscription'") &&
 webhookRe.includes("'superseded-subscription'"), 'Webhook must guard historical subscriptions');
const billingNew=fs.readFileSync('components/billing/BillingClient.tsx','utf8');
assert.ok(billingNew.includes('acceptNewCharge') && billingNew.includes('canResubscribe'), 'Billing must ask for new-charge consent');
assert.ok(!webhookRe.includes('claim_old_subscription'), 'Do not invent unsupported Creem event claim');

const expectedSeatIdentity={subscriptionId:'sub_abc123',customerId:'cust_abc123',productId:'prod_pro123',mode:'test' as const};
const completeSeat={...raw,items:[{id:'sitem_good',product_id:'prod_pro123',price_id:'pprice_example',units:2}]};
const minimalSeat={...raw,items:[{id:'sitem_good',product_id:'prod_pro123',units:1}]};
const seatDetails=parseCreemSeatState(completeSeat,expectedSeatIdentity);
assert.equal(seatDetails.itemId,'sitem_good');
assert.equal(seatDetails.priceId,'pprice_example');
assert.equal(seatDetails.units,2);
const minimal=parseCreemSeatState(minimalSeat,expectedSeatIdentity);
assert.equal(minimal.priceId,null,'price_id is optional in Creem subscription items');
assert.equal(minimal.units,1);
assert.equal(parseCreemSeatState({subscription:minimalSeat},expectedSeatIdentity).units,1);
for(const invalid of [
 {...minimalSeat,mode:'prod'}, {...minimalSeat,customer:{id:'cust_other'}},
 {...minimalSeat,product:{id:'prod_team123'}}, {...minimalSeat,items:[]},
 {...minimalSeat,items:[{id:'sitem_good',product_id:'prod_wrong',units:2}]},
 {...minimalSeat,items:[{id:'wrong',product_id:'prod_pro123',units:2}]},
 {...minimalSeat,items:[{id:'sitem_good',product_id:'prod_pro123',units:0}]},
 {...minimalSeat,items:[{id:'sitem_good',product_id:'prod_pro123',units:1.5}]},
])assert.throws(()=>parseCreemSeatState(invalid,expectedSeatIdentity),SeatValidationError);
assert.deepEqual(seatUpdatePayload(minimal,5,'proration-charge-immediately'),{
  items:[{id:'sitem_good',product_id:'prod_pro123',units:5}],
  update_behavior:'proration-charge-immediately'
});
assert.deepEqual(seatUpdatePayload(seatDetails,5,'proration-charge-immediately'),{
  items:[{id:'sitem_good',product_id:'prod_pro123',price_id:'pprice_example',units:5}],
  update_behavior:'proration-charge-immediately'
});
assert.deepEqual(seatUpdatePayload(seatDetails,1,'proration-none'),{
  items:[{id:'sitem_good',product_id:'prod_pro123',price_id:'pprice_example',units:1}],
  update_behavior:'proration-none'
});
assert.throws(()=>seatUpdatePayload(minimal,501,'proration-none'),SeatValidationError);
assert.throws(()=>seatUpdatePayload({itemId:'wrong',productId:'prod_pro123',priceId:null},5,'proration-none'),SeatValidationError);
const seatRouteCode=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
assert.ok(seatRouteCode.includes('parseCreemSeatState') && seatRouteCode.includes('STALE_SEAT_STATE') &&
 seatRouteCode.includes('pendingVerification:!verified'), 'Seat changes must require identity and payment verification');
assert.ok(seatRouteCode.includes("org.subscription_status!=='active'"),'Seat changes must not modify cancelled or unpaid subscriptions');

const seatSafetySql=fs.readFileSync('supabase/migrations/20261101180000_creem_seat_change_safety.sql','utf8');
for (const marker of [
  'uq_creem_seat_changes_open','reserve_creem_seat_change',
  'transition_creem_seat_change','confirm_creem_seat_change',
  "status IN ('pending','awaiting_sync','review')",'previous_transaction_id'
]) assert.ok(seatSafetySql.includes(marker),'Missing atomic Creem seat safety: '+marker);
assert.ok(seatSafetySql.includes('FOR UPDATE'),'Seat reservations must lock org row');
assert.ok(seatSafetySql.includes('current_org.creem_subscription_id IS DISTINCT FROM p_subscription'),
 'Seat reservation must verify ownership');
assert.ok(seatSafetySql.includes("p_event='subscription.paid' OR sc.desired_seats<sc.previous_seats"),
 'Increases must not settle on an unpaid update event');
assert.ok(seatSafetySql.includes('REVOKE ALL ON FUNCTION public.reserve_creem_seat_change'),
 'Seat reservation RPC must be service-role only');
const entSource=fs.readFileSync('lib/entitlements.ts','utf8');
assert.ok(entSource.includes('creem_seat_changes') && entSource.includes('Math.min(seatLimit'),
 'Pending increases must not grant seats');
assert.ok(entSource.includes('hasRealSubscription ? (storedOk ? Math.floor(stored) : 1)'),
 'Missing paid seat count must not grant infinity');
const seatUi=fs.readFileSync('components/billing/BillingClient.tsx','utf8');
assert.ok(seatUi.includes('seatReductionAcknowledged') && seatUi.includes('Boolean(seatChange)'),
 'Seat change must show clear reduction consent and block concurrent mutations');
const seatHook=fs.readFileSync('hooks/useOrganizationBilling.ts','utf8');
assert.ok(seatHook.includes("setCheckoutBusy('seats')"), 'Seat updates must use their own busy state');
assert.ok(seatRouteCode.includes("CREEM_SEAT_MUTATIONS_ENABLED") && seatRouteCode.includes('reserve_creem_seat_change'),
 'Seat update must be disabled until atomic guard is available');
assert.ok(seatRouteCode.includes('CREEM_UNAVAILABLE') && seatRouteCode.includes('traceId'),
 'Provider failures must have actionable, sanitized diagnostic codes');
const subscriptionWebhook=fs.readFileSync('app/api/webhooks/creem/route.ts','utf8');
assert.ok(subscriptionWebhook.includes("confirm_creem_seat_change"),
 'Signed paid/update webhook must verify pending seat mutations');
const seatPaymentHelper=fs.readFileSync('lib/creem-seat-payment.ts','utf8');
assert.ok(seatRouteCode.includes('verifyCreemSeatIncreasePayment') &&
 seatPaymentHelper.includes("transactions?transaction_id="),
 'Immediate and delayed paid seat transaction verification must use the shared helper');

const seatGuardSql=fs.readFileSync('supabase/migrations/20261101180000_creem_seat_change_safety.sql','utf8');
assert.ok(seatGuardSql.includes('guard_creem_team_member_seat') &&
 seatGuardSql.includes('FOR UPDATE') &&
 seatGuardSql.includes('COUNT(DISTINCT tm.user_id)') &&
 seatGuardSql.includes('BEFORE INSERT ON public.team_members'), 'DB must prevent concurrent paid seat over-allocation');
assert.ok(seatGuardSql.includes('tm.user_id=NEW.user_id'), 'Existing users in additional teams must not consume extra seats');
const invitationCode=fs.readFileSync('lib/db.ts','utf8');
assert.ok(invitationCode.includes('SEAT_LIMIT_REACHED') &&
 invitationCode.includes('currentSeats>=allowed'), 'Invitations must check seats before creating user records');

assert.ok(seatGuardSql.includes("CREATE TRIGGER trg_guard_creem_team_member_seat"),
 'Creem membership guard must install an actual DB trigger');
assert.ok(seatGuardSql.includes("o.billing_provider IS DISTINCT FROM 'creem'"), 'Paid seat trigger must not affect legacy/owner organizations');
assert.ok(seatGuardSql.includes("p_before_transaction"), 'Payment verification must preserve the last transaction ID before the seat change');
assert.ok(seatGuardSql.includes("COUNT(DISTINCT tm.user_id)") && seatGuardSql.includes("FOR UPDATE"),
 'Concurrent organization membership inserts must be serialized and count distinct users');

// Regression: an earlier migration granted EXECUTE to a nonexistent five-argument overload.
const seatSql=fs.readFileSync('supabase/migrations/20261101180000_creem_seat_change_safety.sql','utf8');
assert.ok(seatSql.includes('GRANT EXECUTE ON FUNCTION public.reserve_creem_seat_change(UUID,TEXT,INTEGER,INTEGER,BOOLEAN,TEXT)'), 'Reservation grant must exactly match the six-argument function');
assert.ok(!seatSql.includes('GRANT EXECUTE ON FUNCTION public.reserve_creem_seat_change(UUID,TEXT,INTEGER,INTEGER,BOOLEAN)'), 'Legacy five-parameter grant must never return');

const readOnlyInspector=fs.readFileSync('scripts/inspect-creem-seats.ts','utf8');
assert.ok(readOnlyInspector.includes("'GET'") && !readOnlyInspector.includes("'POST'"),'CLI must never mutate subscription seats');
assert.ok(readOnlyInspector.includes('price_id') && readOnlyInspector.includes('product_id'),'CLI must surface safe item field availability');
assert.ok(seatRouteCode.includes('CREEM_RESOURCE_NOT_FOUND'),'Creem 404 must not be described as a declined card');

const inspector=fs.readFileSync('scripts/inspect-creem-seats.ts','utf8');
assert.ok(inspector.includes('seatUpdateFieldsReady') && inspector.includes('priceIdRequiredForSeatChange: false'),
  'Read-only inspector should distinguish optional price ID from update capability');
assert.ok(seatRouteCode.includes('seatUpdatePayload(current,desired'), 'Seat-change flow must use the minimal documented payload');
const seatModule=fs.readFileSync('lib/creem-seats.ts','utf8');
assert.ok(seatModule.includes('price_id:(item as CreemSeatState).priceId') && !seatModule.includes('!item.price_id'),
  'Use verified optional price ID without enforcing an arbitrary prefix');

const paymentChange={subscription_id:'sub_paid',previous_seats:1,desired_seats:3,
 previous_transaction_id:'tran_old',created_at:'2026-11-01T17:02:57.000Z'};
const paymentSubscription={id:'sub_paid',mode:'test',status:'active',
 items:[{id:'sitem_1',units:3}],customer:'cust_paid',last_transaction_id:'tran_new'};
const paymentTransaction={id:'tran_new',mode:'test',status:'paid',amount_paid:800,
 subscription:'sub_paid',customer:'cust_paid',type:'invoice',currency:'USD',
 refunded_amount:null,created_at:1793552600000};
assert.equal(matchesPaidSeatIncrease(paymentChange,paymentSubscription,paymentTransaction,'test'),true);
for(const [change,sub,tx] of [
 [{...paymentChange,previous_transaction_id:'tran_new'},paymentSubscription,paymentTransaction],
 [paymentChange,{...paymentSubscription,last_transaction_id:'tran_old'},paymentTransaction],
 [paymentChange,{...paymentSubscription,items:[{units:1}]},paymentTransaction],
 [paymentChange,paymentSubscription,{...paymentTransaction,status:'pending'}],
 [paymentChange,paymentSubscription,{...paymentTransaction,amount_paid:0}],
 [paymentChange,paymentSubscription,{...paymentTransaction,mode:'prod'}],
 [paymentChange,paymentSubscription,{...paymentTransaction,subscription:'sub_other'}],
 [paymentChange,paymentSubscription,{...paymentTransaction,created_at:1793550000000}],
 [paymentChange,paymentSubscription,{...paymentTransaction,created_at:1793552600000+1200000+100000}],
 [paymentChange,paymentSubscription,{...paymentTransaction,customer:'cust_wrong'}],
 [paymentChange,paymentSubscription,{...paymentTransaction,currency:'EUR'}],
 [paymentChange,paymentSubscription,{...paymentTransaction,type:'payment'}],
 [paymentChange,paymentSubscription,{...paymentTransaction,refunded_amount:100}],
 [paymentChange,{...paymentSubscription,customer:'cust_wrong'},paymentTransaction],
 ] as any[])assert.equal(matchesPaidSeatIncrease(change,sub,tx,'test'),false);
const paymentWebhook=fs.readFileSync('app/api/webhooks/creem/route.ts','utf8');
assert.ok(paymentWebhook.includes('verifyCreemSeatIncreasePayment(config,change') &&
 !paymentWebhook.includes("if(process.env.CREEM_SEAT_MUTATIONS_ENABLED==='true' &&\n      result.applied && result.snapshot.status==='active' &&\n      (kind==='subscription.paid'||kind==='subscription.update')) {\n     const {error:seatError}"),
 'Subscription.paid without verified seat transaction must not settle an increase');
const paymentOps=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
assert.ok(paymentOps.includes('verifyCreemSeatIncreasePayment(config,{') &&
 paymentOps.includes('getCreemConfig(),change as PendingSeatIncrease'),
 'Both immediate and delayed reconciliation must validate a fresh paid transaction');


const consentState:BillingConsentState={
 operation:'seats',organizationId:'org_test',subscriptionId:'sub_test',
 fromPlan:'pro',toPlan:'pro',fromSeats:3,toSeats:4,mode:'test',
 lastTransactionId:'tran_before',updatedAt:'2026-11-01T20:10:00.000Z',
 periodEndAt:'2026-12-01T20:10:00.000Z',nextChargeAt:'2026-12-01T20:10:00.000Z'
};
const signingSecret='creem-webhook-secret-for-consent-tests-only-123';
const issuedAt=Date.UTC(2026,10,1,20,10);
const consentToken=issueBillingConsent(consentState,signingSecret,issuedAt);
assert.equal(verifyBillingConsent(consentToken,consentState,signingSecret,issuedAt+1000),true,
 'Current approved payment state should be accepted');
for (const altered of [
 {...consentState,toSeats:5}, {...consentState,fromSeats:2},
 {...consentState,organizationId:'org_other'}, {...consentState,subscriptionId:'sub_other'},
 {...consentState,mode:'prod' as const}, {...consentState,lastTransactionId:'tran_after'},
 {...consentState,updatedAt:'2026-11-01T20:11:00.000Z'},
 {...consentState,periodEndAt:'2026-12-09T20:10:00.000Z'},
 {...consentState,nextChargeAt:'2026-12-09T20:10:00.000Z'},
 {...consentState,operation:'upgrade' as const}, {...consentState,toPlan:'team'}
])assert.equal(verifyBillingConsent(consentToken,altered,signingSecret,issuedAt+1000),false,
 'Never reuse paid consent for changed billing state');
assert.equal(verifyBillingConsent(consentToken,consentState,signingSecret,issuedAt+300001),false,
 'Expired confirmation may not charge');
assert.equal(verifyBillingConsent(consentToken+'x',consentState,signingSecret,issuedAt+1000),false,
 'Tampered consent may not charge');
assert.equal(verifyBillingConsent('garbage',consentState,signingSecret,issuedAt+1000),false);
assert.equal(verifyBillingConsent(consentToken,consentState,'different-secret-with-enough-entropy',issuedAt+1000),false);
const upgradeConsent={...consentState,operation:'upgrade' as const,fromPlan:'pro',toPlan:'team',fromSeats:3,toSeats:3};
const upgradeToken=issueBillingConsent(upgradeConsent,signingSecret,issuedAt);
assert.equal(verifyBillingConsent(upgradeToken,upgradeConsent,signingSecret,issuedAt+1000),true);
assert.equal(verifyBillingConsent(upgradeToken,consentState,signingSecret,issuedAt+1000),false);
const consentOperations=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
const seatEndpoint=fs.readFileSync('app/api/billing/update-seats/route.ts','utf8');
const planEndpoint=fs.readFileSync('app/api/billing/switch-plan/route.ts','utf8');
const consentUI=fs.readFileSync('components/billing/BillingClient.tsx','utf8');
const consentHook=fs.readFileSync('hooks/useOrganizationBilling.ts','utf8');
assert.ok(consentOperations.includes("body?.action==='preview'") &&
 consentOperations.includes("body?.action!=='confirm'") &&
 consentOperations.includes('verifyBillingConsent') &&
 consentOperations.includes('issueBillingConsent'), 'Both paid change endpoints must enforce signed preview and confirmation');
assert.ok(seatEndpoint.includes('requireOrgAdmin') && planEndpoint.includes('requireOrgAdmin'),
 'Billing endpoints must require organizational admin');
assert.ok(consentHook.includes("action: 'preview'") && consentHook.includes("action: 'confirm'"),
 'UI must separate review and charge requests');
assert.ok(consentUI.includes('Authorize charge &amp; confirm') &&
 consentUI.includes('reviewAcknowledged') && consentUI.includes('requestSeatReview') &&
 consentUI.includes('requestPlanReview') &&
 consentUI.includes('disabled={!reviewAcknowledged||reviewBusy||Boolean(reviewError)||busy}') &&
 consentUI.includes('onClick={()=>void applyReviewedChange()}'),
 'Explicit modal consent, disabled submit and signed review must precede saved-card charges');
assert.ok(consentUI.includes('Today&apos;s charge is prorated') &&
 consentUI.includes('The exact charge is set by Creem') &&
 consentUI.includes('not today&apos;s charge') &&
 consentUI.includes('Your renewal date will change'),
 'Review UI must explain prorated payment, unknown exact charge, monthly list price and cycle reset');
assert.ok(consentUI.includes('max-h-[92dvh]') &&
 consentUI.includes('aria-label="Close billing review"') &&
 consentUI.includes('aria-label="Copy subscription reference"'),
 'Premium billing controls must remain scrollable and accessible');
console.log('Creem explicit billing-consent tests passed');

const activeCycle=readCreemBillingCycle({subscription:{
 status:'active',
 current_period_start_date:'2026-11-01T20:03:00Z',
 current_period_end_date:'2026-12-01T20:03:00Z',
 next_transaction_date:'2026-12-01T20:03:00Z'
}});
assert.deepEqual(activeCycle,{
 currentPeriodStartAt:'2026-11-01T20:03:00.000Z',
 currentPeriodEndAt:'2026-12-01T20:03:00.000Z',
 nextChargeAt:'2026-12-01T20:03:00.000Z',nextChargeVerified:true
});
const afterIncrease=readCreemBillingCycle({status:'active',
 current_period_start_date:'2026-11-09T20:03:00Z',
 current_period_end_date:'2026-12-09T20:03:00Z',
 next_transaction_date:'2026-12-09T20:03:00Z'});
assert.equal(afterIncrease.nextChargeAt,'2026-12-09T20:03:00.000Z',
 'Use actual new provider date, not sign-up date + 30 days');
assert.equal(CREEM_IMMEDIATE_CYCLE_POLICY,'new-cycle-on-immediate-charge');
for(const status of ['scheduled_cancel','canceled','expired','paused','unpaid','past_due']) {
 const cycle=readCreemBillingCycle({status,next_transaction_date:'2026-12-09T20:03:00Z'});
 assert.equal(cycle.nextChargeAt,null, 'Do not promise an automatic charge in '+status);
}
assert.equal(readCreemBillingCycle({status:'active',
 current_period_end_date:'2026-12-09T20:03:00Z'}).nextChargeAt,null,
 'Period end is not proof of next card charge');
assert.equal(readCreemBillingCycle({status:'active',next_transaction_date:'not a date'}).nextChargeVerified,false);
assert.equal(creemUtcDate('2026-12-09'),null,'Reject date-only and timezone-ambiguous inputs');
assert.equal(creemUtcDate('2026-12-09T20:03:00'),null,'Require an explicit offset or UTC for billing dates');
assert.equal(creemUtcDate('not a date'),null);
assert.equal(creemUtcDate('2026-12-09T20:03:00+03:00'),'2026-12-09T17:03:00.000Z');
const scheduleRoute=fs.readFileSync('app/api/billing/summary/route.ts','utf8');
assert.ok(scheduleRoute.includes('readCreemBillingCycle') &&
 scheduleRoute.includes('billingCycle') && scheduleRoute.includes('creemResponseMode(config)'),
 'Renewal calendar must be read from matching provider subscription, never guessed');
const scheduleOps=fs.readFileSync('lib/creem-billing-operations.ts','utf8');
assert.ok(scheduleOps.includes('currentNextChargeAt:cycleBefore.nextChargeAt') &&
 scheduleOps.includes('nextChargeAfterChangeAt:null') &&
 scheduleOps.includes('periodEndAt:cycleBefore.currentPeriodEndAt'),
 'Charge approval must disclose unknown next cycle and bind current schedule');
const scheduleUI=fs.readFileSync('components/billing/BillingClient.tsx','utf8');
assert.ok(scheduleUI.includes('Next scheduled charge') &&
 scheduleUI.includes('The immediate-charge option starts a new billing cycle') &&
 scheduleUI.includes('List prices exclude individual discounts or credits') &&
 scheduleUI.includes('billingCycle?.nextChargeVerified'),
 'Billing must display the Creem-verified next charge, not imply a fixed anchor or payable amount');
console.log('Creem billing-cycle regression tests passed');


const annualMigration=fs.readFileSync('supabase/migrations/20261107173000_creem_annual_product_intents.sql','utf8');
for(const field of ['product_id TEXT','billing_interval TEXT','creem_checkout_product_interval_check'])
 assert.ok(annualMigration.includes(field),'Missing annual checkout safety migration: '+field);
const annualHook=fs.readFileSync('app/api/webhooks/creem/route.ts','utf8');
assert.ok(annualHook.includes('checkoutProductId===selectedProductId'),
 'Webhook must check exact checkout product, not just plan');
assert.ok(annualHook.includes('creemIntervalForProduct(selectedProductId,config)===selectedInterval'),
 'Webhook must check authorized cadence');
const annualUi=fs.readFileSync('components/marketing/sections/MarketingPricing.tsx','utf8');
assert.ok(annualUi.includes('Yearly · save 16.7%') && annualUi.includes('billingInterval'),
 'Landing must expose annual pricing honestly');
