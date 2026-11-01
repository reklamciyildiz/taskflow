import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { organizationDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOrganizationSeatUsage } from '@/lib/entitlements';
import { APP_URL } from '@/lib/site-config';
import { creemApi, creemProductForPlan, getCreemConfig, creemResponseMode } from '@/lib/creem-config';
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
  return NextResponse.json({success:true,data:{reconciled:result.applied}});
 }catch(e){return errorResponse(e,'reconcile')}
}
export async function changeCreemSeats(request:NextRequest,orgId:string) {
 try{
  const config=getCreemConfig(),org:any=await organizationDb.getById(orgId);
  if(org?.billing_provider!=='creem'||!org.creem_subscription_id)
   return NextResponse.json({success:false,error:'No Creem subscription found'},{status:404});
  if(org.plan_name!=='pro' && org.plan_name!=='team')
   return NextResponse.json({success:false,error:'Individual has one fixed seat'},{status:400});
  const {seats}=await request.json().catch(()=>({seats:null}));
  const requested=Number(seats);
  if(!Number.isInteger(requested)||requested<1||requested>500)
   return NextResponse.json({success:false,error:'Invalid seat count'},{status:400});
  if(requested < await getOrganizationSeatUsage(orgId))
   return NextResponse.json({success:false,error:'Cannot reduce below current active members'},{status:409});
  const remote=await creemApi<any>(config,'GET','subscriptions?subscription_id='+encodeURIComponent(org.creem_subscription_id));
  const item=remote.items?.[0];
  const snapshot=await fetchCreemSubscription(org.creem_subscription_id,config);
  if(snapshot.status!=='active' || !item?.id)
   return NextResponse.json({success:false,error:'Subscription must be active and have an item to change seats'},{status:409});
  if(requested===snapshot.seats)return NextResponse.json({success:true,reduced:false});
  const reduced=requested<snapshot.seats;
  await creemApi(config,'POST','subscriptions/'+encodeURIComponent(snapshot.subscriptionId),{
   items:[{id:item.id,units:requested}],
   update_behavior:reduced?'proration-none':'proration-charge-immediately'
  });
  return NextResponse.json({success:true,reduced});
 }catch(e){return errorResponse(e,'update-seats')}
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
  if((await getOrganizationSeatUsage(orgId))>1 && plan==='individual')
   return NextResponse.json({success:false,error:'Individual requires one member'},{status:409});
  const snapshot=await fetchCreemSubscription(org.creem_subscription_id,config);
  if(snapshot.status!=='active')return NextResponse.json({success:false,error:'Only active subscriptions can be upgraded'},{status:409});
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
