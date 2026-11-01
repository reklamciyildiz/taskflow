/**
 * Read-only Creem Test Mode subscription inspection.
 * Never prints API credentials, payment details, customer identity or full IDs.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd(), true);
async function main() {
 if(process.env.CREEM_MODE!=='test')throw Error('This inspector only supports CREEM_MODE=test');
 const sub=process.argv[2];
 if(!sub || !/^sub_[A-Za-z0-9_-]+$/.test(sub))throw Error('Usage: npm run creem:inspect-seats -- sub_YOUR_TEST_SUBSCRIPTION_ID');
 const key=process.env.CREEM_API_KEY?.trim();
 if(!key)throw Error('Missing test CREEM_API_KEY in .env.local');
 const url='https://test-api.creem.io/v1/subscriptions?subscription_id='+encodeURIComponent(sub);
 const res=await fetch(url,{method:'GET',headers:{'x-api-key':key},cache:'no-store'});
 if(!res.ok)throw Error('Read-only Creem lookup returned HTTP '+res.status);
 const data:any=await res.json();
 const obj=data?.subscription??data;
 if(obj?.id!==sub || obj?.mode!=='test')throw Error('Subscription ID or mode mismatch');
 const items=Array.isArray(obj?.items)?obj.items:[];
 const expectedProduct=process.env.CREEM_PRODUCT_PRO?.trim();
 console.log(JSON.stringify({
   mode:obj.mode,status:obj.status,subscriptionMatched:true,
   isConfiguredPro:typeof obj.product==='string'?obj.product===expectedProduct:obj.product?.id===expectedProduct,
   itemCount:items.length,
   priceIdRequiredForSeatChange: false,
   seatUpdateFieldsReady:obj.status==='active' && items.length===1 &&
     typeof items[0]?.id==='string' && items[0].id.startsWith('sitem_') &&
     items[0]?.product_id===(typeof obj.product==='string'?obj.product:obj.product?.id) &&
     Number.isSafeInteger(Number(items[0]?.units)) && Number(items[0].units)>=1,
   items:items.map((item:any)=>({
     itemPrefix:typeof item?.id==='string'?item.id.split('_')[0]:'missing',
     hasItemId:typeof item?.id==='string',
     productMatchesSubscription:typeof item?.product_id==='string' &&
       item.product_id===(typeof obj.product==='string'?obj.product:obj.product?.id),
     priceIdPresent:typeof item?.price_id==='string' && item.price_id.length>0,
     priceIdPrefix:typeof item?.price_id==='string' ? item.price_id.split('_')[0] : null,
     units:item.units
   })),
   lastTransactionPresent:typeof obj?.last_transaction_id==='string',
 },null,2));
}
main().catch(e=>{console.error('Read-only inspection:',e instanceof Error?e.message:'Unexpected failure');process.exitCode=1});
