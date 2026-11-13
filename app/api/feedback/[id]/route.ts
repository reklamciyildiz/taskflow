import {NextRequest,NextResponse} from 'next/server';
import {activeFeedbackPost,decorateFeedbackPosts,feedbackActor,feedbackDb,feedbackError,isFeedbackStaff} from '@/lib/feedback/server';

export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:{id:string}}){
  try{
    const actor=await feedbackActor(request);if(actor instanceof NextResponse) return actor;
    const post=await activeFeedbackPost(params.id);
    const permitted=post && (post.moderation==='approved'||post.author_user_id===actor.id||isFeedbackStaff(actor));
    if(!permitted)return NextResponse.json({success:false,error:'Öneri bulunamadı.'},{status:404});
    const {data,error}=await feedbackDb.from('feedback_comments')
      .select('id,post_id,body,moderation,created_at,author_user_id')
      .eq('post_id',post.id).order('created_at',{ascending:true}).limit(100);
    if(error)throw error;
    const comments=(data||[]).filter(c=>c.moderation==='approved'||c.author_user_id===actor.id||isFeedbackStaff(actor))
      .map(c=>({id:c.id,post_id:c.post_id,body:c.body,moderation:c.moderation,
        created_at:c.created_at,is_mine:c.author_user_id===actor.id}));
    const [decorated]=await decorateFeedbackPosts([post],actor.id);
    return NextResponse.json({success:true,data:{post:decorated,comments}},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){return feedbackError(e);}
}
