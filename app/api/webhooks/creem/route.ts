import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCreemConfig, creemPlanForProduct, creemResponseMode } from '@/lib/creem-config';
import { reconcileCreemSubscription } from '@/lib/creem-subscription';
export const runtime='nodejs';
const updateEvents=new Set(['subscription.active','subscription.paid','subscription.canceled','subscription.expired','subscription.trialing','subscription.paused','subscription.update']);
function safeSignature(raw:string, signature:string|null,secret:string):boolean {
 if(!signature || !/^[a-f0-9]{64}$/i.test(signature))return false;
 const computed=crypto.createHmac('sha256',secret).update(raw).digest();
 const provided=Buffer.from(signature,'hex');
 return computed.length===provided.length && crypto.timingSafeEqual(computed,provided);
}
function objectId(x:any):string|null {return typeof x==='string'?x:typeof x?.id==='string'?x.id:null;}
async function logEvent(id:string,status:string,reason?:string) {
 const {error}=await (supabaseAdmin as any).from('creem_webhook_events').update({
  status,last_error:reason?.slice(0,500)??null,...(status==='completed'?{completed_at:new Date().toISOString()}:{})
 }).eq('event_id',id);
 if(error)throw error;
}
export async function POST(request:NextRequest) {
 let eventId='';
 try {
  const config=getCreemConfig();
  const raw=await request.text();
  if(raw.length>262144)return NextResponse.json({error:'Payload too large'},{status:413});
  if(!safeSignature(raw,request.headers.get('creem-signature'),config.secret))
   return NextResponse.json({error:'Invalid webhook signature'},{status:401});
  const event=JSON.parse(raw);
  eventId=String(event?.id ?? '');
  const kind=String(event?.eventType ?? '');
  if(!/^evt_[a-zA-Z0-9]+$/.test(eventId) || !kind) return NextResponse.json({error:'Invalid webhook event'},{status:400});
  const sha=crypto.createHash('sha256').update(raw).digest('hex');
  const {data:claimed,error:claimError}=await (supabaseAdmin as any).rpc('claim_creem_event',{p_id:eventId,p_hash:sha,p_type:kind});
  if(claimError)throw claimError;
  if(!claimed){
   const {data:row,error}=await (supabaseAdmin as any).from('creem_webhook_events').select('status').eq('event_id',eventId).single();
   if(error)throw error;
   return NextResponse.json({ok:row?.status==='completed'},{status:row?.status==='completed'?200:503});
  }
  const obj=event.object ?? {};
  if(kind==='checkout.completed'){
   const requestId=String(obj.request_id??'');
   const {data:intent,error}=await (supabaseAdmin as any).from('creem_checkout_intents').select('*').eq('request_id',requestId).single();
   if(error || !intent)throw new Error('Creem checkout missing authorized intent');
   if(Boolean(intent.test_mode)!==(config.mode==='test') || obj.mode!==creemResponseMode(config) ||
       String(obj.status)!=='completed' || String(obj.order?.status)!=='paid')
     throw new Error('Checkout state/mode is not verified as paid');
   const productId=objectId(obj.product);
   const plan=productId?creemPlanForProduct(productId,config):null;
   if(plan!==intent.plan_name)throw new Error('Checkout product differs from authorized plan');
   const quantity=Number(obj.units ?? 1);
   if(quantity!==Number(intent.units))throw new Error('Checkout quantity mismatch');
   const sid=objectId(obj.subscription);
   if(!sid)throw new Error('Missing subscription in completed checkout');
   const result=await reconcileCreemSubscription(intent.organization_id,sid,config);
   if(!result.applied)throw new Error('Creem checkout subscription not applied');
   const {error:markError}=await (supabaseAdmin as any).from('creem_checkout_intents').update({fulfilled_at:new Date().toISOString()}).eq('request_id',requestId);
   if(markError)throw markError;
  }else if(updateEvents.has(kind)){
   const sid=objectId(obj.id);
   if(!sid)throw new Error('Creem subscription event without subscription id');
   const {data:org,error}=await (supabaseAdmin as any).from('organizations').select('id').eq('creem_subscription_id',sid).maybeSingle();
   if(error)throw error;
   // Initial events can arrive before checkout.completed. Retrying lets checkout link the owner.
   if(!org)throw new Error('Creem subscription event arrived before checkout mapping');
   await reconcileCreemSubscription(org.id,sid,config);
  }else if(kind==='refund.created' || kind==='dispute.created'){
   const sid=objectId(obj.subscription) ?? objectId(obj.transaction?.subscription);
   if(!sid)throw new Error('Payment reversal missing subscription mapping - manual review needed');
   const {data, error}=await (supabaseAdmin as any).rpc('hold_creem_subscription',{p_subscription_id:sid,p_reason:kind});
   if(error)throw error;
   if(!data)throw new Error('Reversed subscription has no known organization');
  }else{
   await logEvent(eventId,'completed');
   return NextResponse.json({ok:true,ignored:true});
  }
  await logEvent(eventId,'completed');
  return NextResponse.json({ok:true});
 }catch(e:any){
  console.error('[creem] webhook failed',eventId,e?.message);
  if(eventId)await logEvent(eventId,'failed',e?.message).catch(()=>null);
  return NextResponse.json({error:'Webhook processing failed'},{status:500});
 }
}
