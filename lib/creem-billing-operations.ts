import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { organizationDb } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getOrganizationSeatUsage } from '@/lib/entitlements';
import { APP_URL } from '@/lib/site-config';
import { creemApi, creemProductForPlan, getCreemConfig, creemResponseMode } from '@/lib/creem-config';
import { fetchCreemSubscription, reconcileCreemSubscription } from '@/lib/creem-subscription';
import { CREEM_EXPECTED_TAX_MODE, isPaidPlan, type PaidActiprocPlan } from '@/lib/billing-plans';

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
  if(isExistingSubscription(org) || org?.billing_provider==='lemon')
   return NextResponse.json({success:false,error:'An existing subscription must be managed or resolved before starting another.'},{status:409});
  const payload=await request.json().catch(()=>null);
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
  const {error:intentError}=await (supabaseAdmin as any).from('creem_checkout_intents').insert({
   request_id:requestId,organization_id:orgId,plan_name:plan,units:seats,test_mode:config.mode==='test'
  });
  if(intentError)throw intentError;
  const created=await creemApi<any>(config,'POST','checkouts',{
   product_id:productId,units:seats,request_id:requestId,
   ...(email?{customer:{email}}:{}),
   success_url:APP_URL+'/settings/billing?checkout=success',
   metadata:{organization_id:orgId,checkout_request_id:requestId},
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
