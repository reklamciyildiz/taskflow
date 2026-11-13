import {NextRequest,NextResponse} from 'next/server';
import {feedbackActor,feedbackDb,feedbackError,feedbackMutationOrigin} from '@/lib/feedback/server';
import {isFeedbackId} from '@/lib/feedback/contract';

export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  try{
    const actor=await feedbackActor(request);if(actor instanceof NextResponse)return actor;
    const {data,error}=await feedbackDb.from('feedback_updates')
      .select('id,post_id,status,created_at,is_read').eq('user_id',actor.id)
      .order('created_at',{ascending:false}).limit(50);
    if(error)throw error;
    const ids=Array.from(new Set((data||[]).map(e=>e.post_id)));
    const {data:posts,error:postError}=ids.length
      ?await feedbackDb.from('feedback_posts').select('id,title').in('id',ids)
      :{data:[],error:null};
    if(postError)throw postError;
    const titles=new Map((posts||[]).map(p=>[p.id,p.title]));
    return NextResponse.json({success:true,data:(data||[]).map(e=>({...e,title:titles.get(e.post_id)||'Öneri'}))},
      {headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return feedbackError(e);}
}
export async function POST(request:NextRequest){
  const origin=feedbackMutationOrigin(request);if(origin)return origin;
  try{
    const actor=await feedbackActor(request);if(actor instanceof NextResponse)return actor;
    const json=await request.json().catch(()=>null);
    const id=json?.id;
    if(id!==undefined&&!isFeedbackId(id))
      return NextResponse.json({success:false,error:'Geçersiz bildirim.'},{status:400});
    let q=feedbackDb.from('feedback_updates').update({is_read:true}).eq('user_id',actor.id);
    if(id)q=q.eq('id',id);
    const {error}=await q;if(error)throw error;
    return NextResponse.json({success:true});
  }catch(e){return feedbackError(e);}
}
