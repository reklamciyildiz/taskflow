import {NextRequest,NextResponse} from 'next/server';
import {requireAuthedUser} from '@/lib/server-authz';
import {logOperationalError} from '@/lib/monitoring/operational-error';

export const dynamic='force-dynamic';
const seen=new Map<string,number>();
const LIMIT_MS=60_000;

/** Authenticated, same-origin, tiny client rendering incident ingest.
 * In-memory best-effort dedupe; NOT a distributed abuse quota or complete monitoring.
 */
export async function POST(request:NextRequest){
  const origin=request.headers.get('origin');
  if(!origin)return NextResponse.json({success:false},{status:403});
  try{
    if(new URL(origin).host!==new URL(request.url).host)
      return NextResponse.json({success:false},{status:403});
  }catch{return NextResponse.json({success:false},{status:403});}
  if(!request.headers.get('content-type')?.startsWith('application/json'))
    return NextResponse.json({success:false},{status:415});
  const len=Number(request.headers.get('content-length')||0);
  if(len>1024)return NextResponse.json({success:false},{status:413});
  const authed=await requireAuthedUser(request);
  if(authed instanceof NextResponse)return authed;
  const raw=await request.text().catch(()=>'');
  if(raw.length>1024)return NextResponse.json({success:false},{status:413});
  let payload:unknown;
  try{payload=JSON.parse(raw);}catch{return NextResponse.json({success:false},{status:400});}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    return NextResponse.json({success:false},{status:400});
  const p=payload as Record<string,unknown>;
  if(p.code!=='CLIENT_RENDER_FAILURE'||p.scope!=='shell')
    return NextResponse.json({success:false},{status:400});
  if(p.digest!==undefined&&
     (typeof p.digest!=='string'||p.digest.length>64||!/^[\w-]+$/.test(p.digest)))
    return NextResponse.json({success:false},{status:400});
  const key=authed.user.id;
  const now=Date.now();
  if((seen.get(key)||0)>now-LIMIT_MS)return new NextResponse(null,{status:202});
  seen.set(key,now);
  if(seen.size>2000){
    for(const [id,time] of seen)if(time<now-LIMIT_MS)seen.delete(id);
  }
  logOperationalError({code:'CLIENT_RENDER_FAILURE',eventId:crypto.randomUUID(),scope:'shell',digest:p.digest as string|undefined});
  return new NextResponse(null,{status:202});
}
