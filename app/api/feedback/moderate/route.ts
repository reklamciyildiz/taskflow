import {NextRequest,NextResponse} from 'next/server';
import {FEEDBACK_STATUSES,isFeedbackId,isOneOf} from '@/lib/feedback/contract';
import {activeFeedbackPost,feedbackActor,feedbackDb,feedbackError,feedbackMutationOrigin,isFeedbackStaff} from '@/lib/feedback/server';

export const dynamic='force-dynamic';
async function staff(request:NextRequest){
  const actor=await feedbackActor(request);
  if(actor instanceof NextResponse)return actor;
  if(!isFeedbackStaff(actor))return NextResponse.json({success:false,error:'Yalnızca Actiproc platform yöneticileri.'},{status:403});
  return actor;
}
export async function GET(request:NextRequest){
  try{
    const actor=await staff(request);if(actor instanceof NextResponse)return actor;
    const [posts,comments]=await Promise.all([
      feedbackDb.from('feedback_posts').select('id,title,category,area,moderation,status,created_at,author_user_id')
        .eq('moderation','pending').order('created_at',{ascending:true}).limit(80),
      feedbackDb.from('feedback_comments').select('id,post_id,body,created_at,author_user_id')
        .eq('moderation','pending').order('created_at',{ascending:true}).limit(80),
    ]);
    if(posts.error)throw posts.error;if(comments.error)throw comments.error;
    return NextResponse.json({success:true,data:{posts:posts.data||[],comments:comments.data||[]}},
      {headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return feedbackError(e);}
}
export async function POST(request:NextRequest){
  const origin=feedbackMutationOrigin(request);if(origin)return origin;
  try{
    const actor=await staff(request);if(actor instanceof NextResponse)return actor;
    const json=await request.json().catch(()=>null);
    const action=json?.action;
    const id=json?.id;
    if(!isFeedbackId(id))return NextResponse.json({success:false,error:'Geçersiz kayıt.'},{status:400});
    if(action==='merge'){
      if(!isFeedbackId(json?.targetId)||id===json.targetId)
        return NextResponse.json({success:false,error:'Geçersiz birleştirme hedefi.'},{status:400});
      const {error}=await feedbackDb.rpc('feedback_merge_posts',{p_source:id,p_target:json.targetId});
      if(error)throw error;
      return NextResponse.json({success:true});
    }
    if(action==='approve-post'||action==='reject-post'||action==='status'){
      const post=await activeFeedbackPost(id);
      if(!post)return NextResponse.json({success:false,error:'Öneri bulunamadı.'},{status:404});
      if(action==='status'){
        if(!isOneOf(json?.status,FEEDBACK_STATUSES)||post.moderation!=='approved'||post.merged_into_id)
          return NextResponse.json({success:false,error:'Geçersiz durum güncellemesi.'},{status:400});
        const {error}=await feedbackDb.from('feedback_posts').update({status:json.status}).eq('id',id);
        if(error)throw error;
      } else {
        const approve=action==='approve-post';
        if(post.merged_into_id)return NextResponse.json({success:false,error:'Birleştirilen öneri değiştirilemez.'},{status:400});
        const {error}=await feedbackDb.from('feedback_posts')
          .update({moderation:approve?'approved':'rejected'}).eq('id',id);
        if(error)throw error;
      }
      return NextResponse.json({success:true});
    }
    if(action==='approve-comment'||action==='reject-comment'){
      const {data,error}=await feedbackDb.from('feedback_comments').select('id,post_id').eq('id',id).maybeSingle();
      if(error)throw error;
      if(!data)return NextResponse.json({success:false,error:'Yorum bulunamadı.'},{status:404});
      const post=await activeFeedbackPost(data.post_id);
      if(action==='approve-comment' && (!post||post.moderation!=='approved'||post.merged_into_id))
        return NextResponse.json({success:false,error:'Öneri yayınlanmadan yorum onaylanamaz.'},{status:400});
      const {error:saveError}=await feedbackDb.from('feedback_comments')
        .update({moderation:action==='approve-comment'?'approved':'rejected'}).eq('id',id);
      if(saveError)throw saveError;
      return NextResponse.json({success:true});
    }
    return NextResponse.json({success:false,error:'Geçersiz moderasyon işlemi.'},{status:400});
  }catch(e){return feedbackError(e);}
}
