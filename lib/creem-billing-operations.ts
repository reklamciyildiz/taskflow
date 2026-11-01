import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { organizationDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOrganizationSeatUsage } from '@/lib/entitlements';
import { APP_URL } from '@/lib/site-config';
import { creemApi, CreemApiError, creemProductForPlan, getCreemConfig, creemResponseMode } from '@/lib/creem-config';
import { parseCreemSeatState, seatUpdatePayload, SeatValidationError } from '@/lib/creem-seats';
import { verifyCreemSeatIncreasePayment, type PendingSeatIncrease } from '@/lib/creem-seat-payment';
import { issueBillingConsent, verifyBillingConsent, type BillingConsentState } from '@/lib/creem-billing-consent';
import { fetchCreemSubscription, reconcileCreemSubscription } from '@/lib/creem-subscription';
import { CREEM_EXPECTED_TAX_MODE, isPaidPlan, type PaidActiprocPlan } from '@/lib/billing-plans';
import { creemResumeEligibility } from '@/lib/creem-lifecycle';

function errorResponse(e: unknown, operation: string) {
 console.error('[creem] ' + operation, e instanceof Error ? e.message : 'unexpected');
 return NextResponse.json({success:false,error:'Unable to complete billing operation. Please try again.'},{status:502});
}
function isExistingSubscription(org:any) {
 // An expired subscription id still prevents assigning a different id in the
 // database RPC. Never collect payment for a new subscription we cannot grant.
 return Boolean(org?.ls_subscription_id || org?.creem_subscription_id || org?.creem_payment_hold);
}
export async function createCreemCheckout(request:NextRequest, orgId:string, email:string|null|undefined) {
 try{
  const config=getCreemConfig();
  const org:any=await organizationDb.getById(orgId);
  const payload=await request.json().catch(()=>null);
  const replacing=payload?.resubscribe===true;
  const hasExisting=isExistingSubscription(org) || org?.billing_provider==='lemon';
  if(hasExisting && (!replacing || process.env.CREEM_RESUBSCRIPTION_ENABLED!=='true'))
    return NextResponse.json({success:false,error:'Existing subscriptions must be managed before checkout.'},{status:409});
  if(replacing) {
    if(!payload?.acceptNewCharge || org?.billing_provider!=='creem' ||
       !org.creem_subscription_id || !org.creem_customer_id ||
       org.creem_payment_hold || org.ls_subscription_id ||
       (org.subscription_status!=='cancelled' && org.subscription_status!=='expired') ||
       Boolean(org.creem_test_mode)!==(config.mode==='test'))
      return NextResponse.json({success:false,error:'Re-subscription is unavailable for this organization.'},{status:409});
    const remote=await creemApi<any>(config,'GET','subscriptions?subscription_id='+encodeURIComponent(org.creem_subscription_id));
    const sub=remote?.subscription??remote;
    const customer=typeof sub?.customer==='string'?sub.customer:sub?.customer?.id;
    if(sub?.id!==org.creem_subscription_id || customer!==org.creem_customer_id ||
       sub?.mode!==creemResponseMode(config) ||
       !['canceled','expired'].includes(String(sub?.status)))
      return NextResponse.json({success:false,error:'Creem has not confirmed a terminal cancellation. No payment started.'},{status:409});
  } else if(!hasExisting && payload?.resubscribe) {
    return NextResponse.json({success:false,error:'Use normal checkout for a new subscription.'},{status:400});
  }
  const plan=payload?.plan;
  if(!isPaidPlan(plan))return NextResponse.json({success:false,error:'Invalid paid plan'},{status:400});
  const interval=payload?.billingInterval;
  if(interval && interval!==(plan==='individual'?'yearly':'monthly'))
   return NextResponse.json({success:false,error:'The selected plan does not have that billing interval.'},{status:400});
  const headcount=Math.max(1,await getOrganizationSeatUsage(orgId));
  const requested=payload?.seats===undefined?headcount:Number(payload.seats);
  if(!Number.isInteger(requested)||requested<1||requested>500)
   return NextResponse.json({success:false,error:'Invalid seat quantity'},{status:400});
  const seats=Math.max(requested,headcount);
  if(plan==='individual' && seats!==1)
   return NextResponse.json({success:false,error:'Individual supports one person. Choose Pro or Team for multiple members.'},{status:409});
  // Validate merchant dashboard products before generating any paid checkout.
  const productId=creemProductForPlan(plan,config);
  const product=await creemApi<any>(config,'GET','products?product_id='+encodeURIComponent(productId));
  const expectedCents=plan==='individual'?1200:plan==='pro'?400:600;
  const expectedPeriod=plan==='individual'?'every-year':'every-month';
  if(product.id!==productId || product.mode!==creemResponseMode(config) ||
     product.price!==expectedCents || product.currency!=='USD' || product.billing_type!=='recurring' ||
     product.billing_period!==expectedPeriod || product.tax_mode!==CREEM_EXPECTED_TAX_MODE ||
     product.tax_category!=='saas' || product.status!=='active')
    return NextResponse.json({success:false,error:'Creem product settings do not match Actiproc pricing. Contact support.'},{status:409});
  const requestId=crypto.randomUUID();
  if(replacing) {
    const {data:reserved,error:reserveError}=await (supabaseAdmin as any).rpc('reserve_creem_resubscription',{
      p_org:orgId,p_request:requestId,p_previous:org.creem_subscription_id,
      p_plan:plan,p_seats:seats,p_test:config.mode==='test'
    });
    if(reserveError)throw reserveError;
    if(reserved!==true)
      return NextResponse.json({success:false,error:'A subscription change or pending checkout must be resolved before another payment.'},{status:409});
  } else {
    const {error:intentError}=await (supabaseAdmin as any).from('creem_checkout_intents').insert({
      request_id:requestId,organization_id:orgId,plan_name:plan,units:seats,test_mode:config.mode==='test'
    });
    if(intentError)throw intentError;
  }
  const created=await creemApi<any>(config,'POST','checkouts',{
   product_id:productId,units:seats,request_id:requestId,
   ...(replacing?{customer:{id:org.creem_customer_id}}:email?{customer:{email}}:{}),
   success_url:APP_URL+'/settings/billing?checkout=success',
   metadata:{organization_id:orgId,checkout_request_id:requestId,...(replacing?{resubscription:'true'}:{})},
  });
  if(created.mode!==creemResponseMode(config)||!/^https:\/\//.test(created.checkout_url??''))
   throw new Error('Invalid Creem checkout response or environment');
  const {error:updateError}=await (supabaseAdmin as any).from('creem_checkout_intents').update({checkout_id:created.id}).eq('request_id',requestId);
  if(updateError)throw updateError;
  return NextResponse.json({success:true,data:{url:created.checkout_url}});
 }catch(e){return errorResponse(e,'checkout')}
}
export async function createCreemPortal(orgId:string){
 try{
  const config=getCreemConfig(), org:any=await organizationDb.getById(orgId);
  if(org?.billing_provider!=='creem'||!org.creem_customer_id)
   return NextResponse.json({success:false,error:'No Creem subscription found'},{status:404});
  if(Boolean(org.creem_test_mode)!==(config.mode==='test'))
   return NextResponse.json({success:false,error:'Billing environment mismatch'},{status:409});
  const value=await creemApi<any>(config,'POST','customers/billing',{customer_id:org.creem_customer_id});
  const url=value.customer_portal_link;
  if(typeof url!=='string'||!url.startsWith('https://'))throw new Error('Creem portal link missing');
  return NextResponse.json({success:true,data:{customerPortalUrl:url}});
 }catch(e){return errorResponse(e,'portal')}
}
export async function reconcileCreemOrg(orgId:string) {
 try{
  const org:any=await organizationDb.getById(orgId);
  if(org?.billing_provider!=='creem'||!org?.creem_subscription_id)
   return NextResponse.json({success:true,data:{reconciled:false}});
  const result=await reconcileCreemSubscription(orgId,org.creem_subscription_id);
  let seatChangePending=false;
  if(process.env.CREEM_SEAT_MUTATIONS_ENABLED==='true') {
    const {data:change,error:changeError}=await (supabaseAdmin as any).from('creem_seat_changes')
      .select('id,subscription_id,previous_seats,desired_seats,previous_transaction_id,created_at')
      .eq('organization_id',orgId)
      .in('status',['pending','awaiting_sync','review']).maybeSingle();
    if(changeError)throw changeError;
    seatChangePending=Boolean(change);
    if(change && result.applied && result.snapshot.status==='active' &&
       change.subscription_id===result.snapshot.subscriptionId &&
       Number(change.desired_seats)===result.snapshot.seats) {
      let paid=Number(change.desired_seats)<Number(change.previous_seats);
      if(!paid)paid=await verifyCreemSeatIncreasePayment(
        getCreemConfig(),change as PendingSeatIncrease);
      if(paid){
        const {data:settled,error:settleError}=await (supabaseAdmin as any).rpc('confirm_creem_seat_change',{
          p_org:orgId,p_subscription:change.subscription_id,
          p_current_units:Number(change.desired_seats),
          p_event:Number(change.desired_seats)>Number(change.previous_seats)?'subscription.paid':'subscription.update'
        });
        if(settleError)throw settleError;
        if(settled===true)seatChangePending=false;
      }
    }
  }
  return NextResponse.json({success:true,data:{reconciled:result.applied,seatChangePending}});
 }catch(e){return errorResponse(e,'reconcile')}
}
export async function changeCreemSeats(request:NextRequest, orgId:string) {
 try {
  // Release-gated until the single-flight seat migration is installed.
  if(process.env.CREEM_SEAT_MUTATIONS_ENABLED!=='true')
   return NextResponse.json({success:false,code:'SEAT_CHANGES_DISABLED',
     error:'Seat management is temporarily disabled until billing safety checks are configured.'},{status:503});
  const org:any=await organizationDb.getById(orgId);
  if(!org || org?.billing_provider!=='creem' || !org.creem_subscription_id)
   return NextResponse.json({success:false,error:'No Creem subscription found',code:'NO_SUBSCRIPTION'},{status:404});
  if(org.plan_name!=='pro' && org.plan_name!=='team')
   return NextResponse.json({success:false,error:'Only Pro and Team have paid seats.',code:'PLAN_NOT_SUPPORTED'},{status:409});
  if(org.creem_payment_hold || org.subscription_status!=='active')
   return NextResponse.json({success:false,error:'Subscription must be active and payment must be current.',code:'INACTIVE_SUBSCRIPTION'},{status:409});

  const config=getCreemConfig();
  if(Boolean(org.creem_test_mode)!==(config.mode==='test'))
   return NextResponse.json({success:false,error:'Billing environment mismatch',code:'MODE_MISMATCH'},{status:409});

  const body=await request.json().catch(()=>null);
  // No coercion of empty or floating-point input into a billable quantity.
  const desired=body?.seats;
  if(typeof desired!=='number'||!Number.isSafeInteger(desired)||desired<1||desired>500)
   return NextResponse.json({success:false,error:'Enter a whole seat count from 1 to 500.',code:'INVALID_SEATS'},{status:400});

  const activeMembers=Math.max(1,await getOrganizationSeatUsage(orgId));
  if(desired<activeMembers)
   return NextResponse.json({success:false,error:'Remove members before reducing seats below current usage.',code:'SEATS_IN_USE'},{status:409});

  const remote=await creemApi<any>(config,'GET','subscriptions?subscription_id='+encodeURIComponent(org.creem_subscription_id));
  const current=parseCreemSeatState(remote,{
    subscriptionId:org.creem_subscription_id,customerId:org.creem_customer_id,
    productId:org.creem_product_id,mode:creemResponseMode(config)
  });
  if(current.status!=='active')throw new SeatValidationError('NOT_ACTIVE');
  // Fail closed if our current quota diverged. Never charge against stale UI state.
  if(Number(org.seat_limit)!==current.units)throw new SeatValidationError('STALE_SEAT_STATE');
  if(desired===current.units)return NextResponse.json({success:true,data:{changed:false,seats:desired}});

  const increased=desired>current.units;
  const remoteSub=remote?.subscription??remote;
  const beforeTransaction=typeof remoteSub?.last_transaction_id==='string'?remoteSub.last_transaction_id:null;
  // Without a baseline, a later paid renewal cannot prove the extra-seat charge.
  if(increased && !/^tran_[A-Za-z0-9_-]+$/.test(beforeTransaction??''))
    return NextResponse.json({success:false,code:'PAYMENT_BASELINE_MISSING',
      error:'Subscription payment history is unavailable. Contact support before increasing seats.'},{status:409});
  const consentState:BillingConsentState={
    operation:'seats',organizationId:orgId,subscriptionId:current.id,
    fromPlan:org.plan_name,toPlan:org.plan_name,
    fromSeats:current.units,toSeats:desired,
    mode:creemResponseMode(config),lastTransactionId:beforeTransaction,
    updatedAt:current.updatedAt
  };
  if(body?.action==='preview') {
    const {data:open,error:openError}=await (supabaseAdmin as any).from('creem_seat_changes')
      .select('id').eq('organization_id',orgId)
      .in('status',['pending','awaiting_sync','review']).maybeSingle();
    if(openError)throw openError;
    if(open)return NextResponse.json({success:false,code:'SEAT_CHANGE_IN_PROGRESS',
      error:'A previous billing change is still being verified.'},{status:409});
    return NextResponse.json({success:true,data:{
      consentToken:issueBillingConsent(consentState,config.secret),
      previousSeats:current.units,desiredSeats:desired,
      direction:increased?'increase':'decrease',
      currentMonthlyUsd:current.units*(org.plan_name==='team'?6:4),
      nextMonthlyUsd:desired*(org.plan_name==='team'?6:4),
      exactChargeAvailable:false,
      chargeBehavior:increased?'proration-charge-immediately':'proration-none'
    }});
  }
  if(body?.action!=='confirm' || !verifyBillingConsent(body?.consentToken,consentState,config.secret))
    return NextResponse.json({success:false,code:'CONSENT_REQUIRED',
      error:'Billing approval expired or subscription details changed. Review the charge again.'},{status:409});
  // Reserve a single mutation per organization in Postgres, not in React state.
  // Multiple tabs or concurrent admin requests can never issue two seat charges.
  const {data:reservation,error:reserveError}=await (supabaseAdmin as any)
    .rpc('reserve_creem_seat_change',{
      p_org:orgId,p_subscription:current.id,p_previous:current.units,
      p_desired:desired,p_test:config.mode==='test',p_before_transaction:beforeTransaction
    });
  if(reserveError) {
    console.error('[creem] seat reserve SQL not ready',{code:reserveError.code});
    return NextResponse.json({success:false,code:'SEAT_DATABASE_NOT_READY',
      error:'Seat billing safety migration is missing or inaccessible.'},{status:503});
  }
  if(typeof reservation!=='string')
   return NextResponse.json({success:false,code:'SEAT_CHANGE_IN_PROGRESS',
     error:'A previous seat change is still being verified. Refresh Billing before requesting another charge.'},{status:409});

  const transition=async(from:'pending'|'awaiting_sync'|'review',to:'awaiting_sync'|'review'|'failed')=>{
    const {data,error}=await (supabaseAdmin as any).rpc('transition_creem_seat_change',{
      p_id:reservation,p_from:from,p_to:to
    });
    if(error||data!==true)console.error('[creem] seat mutation transition unsuccessful',
      {code:error?.code??'STATE_CONFLICT',from,to});
    return !error&&data===true;
  };

  // This timestamp precedes the provider mutation and guards against using
  // an older paid invoice to activate new seats.
  const requestedAt=new Date().toISOString();
  let update:any;
  try {
    update=await creemApi<any>(config,'POST','subscriptions/'+encodeURIComponent(current.id),
      seatUpdatePayload(current,desired,increased?'proration-charge-immediately':'proration-none'));
  } catch(e) {
    // Unknown responses / provider timeouts may have charged the card.
    // Keep the request locked for review; never automatically charge a second time.
    const definitive=e instanceof CreemApiError && [400,404,422].includes(e.status);
    await transition('pending',definitive?'failed':'review');
    throw e;
  }
  await transition('pending','awaiting_sync');
  const returned=update?.subscription??update;
  if(returned?.id && returned.id!==current.id){
    await transition('awaiting_sync','review');
    throw new SeatValidationError('IDENTITY_MISMATCH');
  }

  // A successful API response is not automatically proof of a captured charge.
  // Query Creem again; increase entitlement only after paid transaction or webhook.
  let verified=false;
  try {
    const latest=await creemApi<any>(config,'GET','subscriptions?subscription_id='+encodeURIComponent(current.id));
    const after=parseCreemSeatState(latest,{
      subscriptionId:current.id,customerId:current.customerId,
      productId:current.productId,mode:creemResponseMode(config)
    });
    if(after.status==='active'&&after.units===desired){
      let paid=!increased;
      if(increased) {
        paid=await verifyCreemSeatIncreasePayment(config,{
          subscription_id:current.id,previous_seats:current.units,desired_seats:desired,
          previous_transaction_id:beforeTransaction,
          created_at:requestedAt
        });
      }
      if(paid){
        const applied=await reconcileCreemSubscription(orgId,current.id,config);
        if(applied.applied){
          const {error:settleError}=await (supabaseAdmin as any).rpc('confirm_creem_seat_change',{
            p_org:orgId,p_subscription:current.id,p_current_units:desired,
            p_event:increased?'subscription.paid':'subscription.update'
          });
          if(settleError)throw settleError;
          verified=true;
        }
      }
    }
  }catch(verifyError) {
    // The update may already be charged: do not reissue it on a read failure.
    console.warn('[creem] seat mutation awaiting authoritative payment verification',
      verifyError instanceof Error ? verifyError.name : 'unknown');
  }
  return NextResponse.json({success:true,data:{
    changed:true,desiredSeats:desired,previousSeats:current.units,
    pendingVerification:!verified,direction:increased?'increase':'decrease'
  }});
 } catch(e) {
  if(e instanceof SeatValidationError) {
   const names={
     IDENTITY_MISMATCH:'Creem subscription ownership could not be verified. No seat update was requested.',
     ITEM_MISMATCH:'Creem subscription item or product does not match this organization. No seat update was requested.',
     INVALID_UNITS:'Creem seat quantity is not valid. No seat update was requested.',
     STALE_SEAT_STATE:'Our seat count differs from Creem. Refresh Billing before making changes.',
     NOT_ACTIVE:'The Creem subscription is not active. Manage payment details in the customer portal.',
   };
   return NextResponse.json({success:false,code:e.code,error:names[e.code]},{status:409});
  }
  if(e instanceof CreemApiError) {
   const code=e.status===404?'CREEM_RESOURCE_NOT_FOUND':
     e.status===402?'PAYMENT_REQUIRED':
     e.status===429?'RATE_LIMITED':
     e.status>=500?'CREEM_UNAVAILABLE':
     e.status>=400&&e.status<500?'CREEM_REJECTED':'CREEM_ERROR';
   const error=code==='PAYMENT_REQUIRED'?'Creem could not collect the seat-change payment. Update the payment method in your customer portal.':
     code==='CREEM_RESOURCE_NOT_FOUND'?'Creem returned HTTP 404 for the subscription seat-change endpoint. The subscription itself may still be active; the update may be unavailable for this account or plan. Do not retry repeatedly. Share the Creem reference with support.':
     code==='CREEM_REJECTED'?'Creem rejected this seat change. Check the payment method or subscription settings.':
     'Creem did not confirm the seat change. Refresh your billing status before trying again.';
   return NextResponse.json({success:false,code,error,traceId:e.traceId??undefined},{status:code==='PAYMENT_REQUIRED'?402:code==='RATE_LIMITED'?429:code==='CREEM_RESOURCE_NOT_FOUND'||code==='CREEM_REJECTED'?409:503});
  }
  return errorResponse(e,'update-seats');
 }
}

export async function changeCreemPlan(request:NextRequest,orgId:string) {
 try{
  const config=getCreemConfig(),org:any=await organizationDb.getById(orgId);
  if(org?.billing_provider!=='creem'||!org.creem_subscription_id)
   return NextResponse.json({success:false,error:'No Creem subscription found'},{status:404});
  const body=await request.json().catch(()=>({}));
  const plan:unknown=body.plan;
  if(!isPaidPlan(plan))return NextResponse.json({success:false,error:'Unknown plan'},{status:400});
  const ordered:PaidActiprocPlan[]=['individual','pro','team'];
  const previous=org.plan_name as PaidActiprocPlan;
  if(ordered.indexOf(plan)<=ordered.indexOf(previous))
   return NextResponse.json({success:false,error:'Downgrades and interval changes must be arranged in the customer portal or with support.'},{status:409});
  if(org.creem_payment_hold || org.subscription_status!=='active' ||
     Boolean(org.creem_test_mode)!==(config.mode==='test'))
    return NextResponse.json({success:false,error:'Subscription payment or environment is not current.'},{status:409});
  if((await getOrganizationSeatUsage(orgId))>1 && plan==='individual')
   return NextResponse.json({success:false,error:'Individual requires one member'},{status:409});
  if(process.env.CREEM_SEAT_MUTATIONS_ENABLED==='true') {
    const {data:open,error}=await (supabaseAdmin as any).from('creem_seat_changes')
      .select('id').eq('organization_id',orgId)
      .in('status',['pending','awaiting_sync','review']).maybeSingle();
    if(error)throw error;
    if(open)return NextResponse.json({success:false,code:'SEAT_CHANGE_IN_PROGRESS',
      error:'Finish or reconcile the pending seat change before upgrading your plan.'},{status:409});
  }
  const snapshot=await fetchCreemSubscription(org.creem_subscription_id,config);
  if(snapshot.status!=='active' || snapshot.customerId!==org.creem_customer_id ||
     snapshot.productId!==org.creem_product_id || snapshot.plan!==previous ||
     snapshot.testMode!==Boolean(org.creem_test_mode))
    return NextResponse.json({success:false,error:'The Creem subscription changed. Refresh billing before upgrading.'},{status:409});
  const raw=await creemApi<any>(config,'GET','subscriptions?subscription_id='+encodeURIComponent(snapshot.subscriptionId));
  const seatState=parseCreemSeatState(raw,{
    subscriptionId:snapshot.subscriptionId,customerId:snapshot.customerId,
    productId:snapshot.productId,mode:creemResponseMode(config)
  });
  if(seatState.status!=='active' || Number(org.seat_limit)!==seatState.units)
    return NextResponse.json({success:false,error:'Subscription seat quantity changed. Refresh billing.'},{status:409});
  const sub=raw?.subscription??raw;
  const consentState:BillingConsentState={
    operation:'upgrade',organizationId:orgId,subscriptionId:snapshot.subscriptionId,
    fromPlan:previous,toPlan:plan,fromSeats:seatState.units,toSeats:seatState.units,
    mode:creemResponseMode(config),lastTransactionId:typeof sub?.last_transaction_id==='string'?sub.last_transaction_id:null,
    updatedAt:seatState.updatedAt
  };
  if(body?.action==='preview') {
    return NextResponse.json({success:true,data:{
      consentToken:issueBillingConsent(consentState,config.secret),
      fromPlan:previous,toPlan:plan,seats:seatState.units,
      nextMonthlyUsd:seatState.units*(plan==='team'?6:plan==='pro'?4:0),
      exactChargeAvailable:false
    }});
  }
  if(body?.action!=='confirm' || !verifyBillingConsent(body?.consentToken,consentState,config.secret))
    return NextResponse.json({success:false,code:'CONSENT_REQUIRED',
      error:'Payment approval expired or subscription details changed. Review the upgrade again.'},{status:409});
  await creemApi(config,'POST','subscriptions/'+encodeURIComponent(snapshot.subscriptionId)+'/upgrade',{
   product_id:creemProductForPlan(plan,config),update_behavior:'proration-charge-immediately'
  });
  return NextResponse.json({success:true});
 }catch(e){return errorResponse(e,'switch-plan')}
}

/** Only resume Creem's scheduled cancellation / pause; terminal cancellation is not reversible. */
export async function resumeCreemBilling(orgId: string) {
 try {
  const config=getCreemConfig();
  const org:any=await organizationDb.getById(orgId);
  if(!org || org.billing_provider!=='creem' || !org.creem_subscription_id || !org.creem_customer_id)
   return NextResponse.json({success:false,error:'No Creem subscription to resume.'},{status:404});
  if(org.creem_payment_hold)
   return NextResponse.json({success:false,error:'This subscription requires payment review before resuming.'},{status:409});
  if(Boolean(org.creem_test_mode)!==(config.mode==='test'))
   return NextResponse.json({success:false,error:'Billing environment mismatch.'},{status:409});
  if(org.subscription_status!=='cancelled' && org.subscription_status!=='paused')
   return NextResponse.json({success:false,error:'Subscription is not cancelled or paused.'},{status:409});
  const raw=await creemApi<any>(config,'GET','subscriptions?subscription_id='+encodeURIComponent(org.creem_subscription_id));
  const remote=raw?.subscription??raw;
  const cust=typeof remote?.customer==='string'?remote.customer:remote?.customer?.id;
  const product=typeof remote?.product==='string'?remote.product:remote?.product?.id;
  if(remote?.id!==org.creem_subscription_id || cust!==org.creem_customer_id ||
     product!==org.creem_product_id || remote?.mode!==creemResponseMode(config))
   return NextResponse.json({success:false,error:'Subscription identity cannot be verified.'},{status:409});
  const action=creemResumeEligibility(String(remote?.status??''));
  if(action==='terminal')
   return NextResponse.json({success:false,error:'Creem has permanently cancelled this subscription. It cannot be resumed; no payment was taken. Contact support to arrange a new subscription.'},{status:409});
  if(action==='blocked')
   return NextResponse.json({success:false,error:'Unresolved payment status. Manage this subscription in the Creem portal.'},{status:409});
  if(action==='already-active') {
   await reconcileCreemSubscription(orgId,org.creem_subscription_id,config);
   return NextResponse.json({success:true,data:{alreadyActive:true}});
  }
  await creemApi(config,'POST','subscriptions/'+encodeURIComponent(org.creem_subscription_id)+'/resume');
  const confirmed=await reconcileCreemSubscription(orgId,org.creem_subscription_id,config);
  return NextResponse.json({success:true,data:{resumed:confirmed.snapshot.status==='active',pending:confirmed.snapshot.status!=='active'}});
 } catch(e) {return errorResponse(e,'resume')}
}

/**
 * Read-only remote eligibility check. A local "cancelled" subscription may
 * refer to either a reversible scheduled cancellation or a terminal cancellation.
 * Fail closed: never offer an action without confirming Creem's live status.
 */
export async function getCreemResumeAvailability(orgId: string) {
 try {
  const org:any=await organizationDb.getById(orgId);
  if(!org || org.billing_provider!=='creem' || !org.creem_subscription_id ||
     !org.creem_customer_id || org.creem_payment_hold ||
     (org.subscription_status!=='cancelled' && org.subscription_status!=='paused' && org.subscription_status!=='expired'))
   return NextResponse.json({success:true,data:{canResume:false,canResubscribe:false}});
  const config=getCreemConfig();
  if(Boolean(org.creem_test_mode)!==(config.mode==='test'))
   return NextResponse.json({success:true,data:{canResume:false,canResubscribe:false}});
  const raw=await creemApi<any>(config,'GET','subscriptions?subscription_id='+encodeURIComponent(org.creem_subscription_id));
  const remote=raw?.subscription??raw;
  const customerId=typeof remote?.customer==='string'?remote.customer:remote?.customer?.id;
  const productId=typeof remote?.product==='string'?remote.product:remote?.product?.id;
  const matches=remote?.id===org.creem_subscription_id &&
   customerId===org.creem_customer_id &&
   productId===org.creem_product_id &&
   remote?.mode===creemResponseMode(config);
  const remoteStatus=String(remote?.status??'');
  return NextResponse.json({success:true,data:{
   canResume:matches && creemResumeEligibility(remoteStatus)==='resume',
   canResubscribe:matches &&
     process.env.CREEM_RESUBSCRIPTION_ENABLED==='true' &&
     !org.ls_subscription_id &&
     ['canceled','expired'].includes(remoteStatus) &&
     ['cancelled','expired'].includes(org.subscription_status)
  }},{headers:{'Cache-Control':'no-store'}});
 } catch {
  // Network failures must not result in an action that will just return an error.
  return NextResponse.json({success:true,data:{canResume:false,canResubscribe:false}},
   {headers:{'Cache-Control':'no-store'}});
 }
}
