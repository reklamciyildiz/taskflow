import {NextRequest,NextResponse} from 'next/server';
import {activeFeedbackPost,feedbackActor,feedbackDb,feedbackError,feedbackMutationOrigin} from '@/lib/feedback/server';

async function mutate(request:NextRequest,id:string,vote:boolean) {
  const origin=feedbackMutationOrigin(request);if(origin)return origin;
  try{
    const actor=await feedbackActor(request);if(actor instanceof NextResponse)return actor;
    const post=await activeFeedbackPost(id);
    if(!post||post.moderation!=='approved'||post.merged_into_id)
      return NextResponse.json({success:false,error:'Bu öneri oylanamıyor.'},{status:404});
    if(vote){
      const {error}=await feedbackDb.from('feedback_votes')
        .upsert({post_id:id,user_id:actor.id},{onConflict:'post_id,user_id',ignoreDuplicates:true});
      if(error)throw error;
    }else{
      const {error}=await feedbackDb.from('feedback_votes').delete()
        .eq('post_id',id).eq('user_id',actor.id);
      if(error)throw error;
    }
    const {data,error}=await feedbackDb.from('feedback_posts').select('vote_count').eq('id',id).single();
    if(error)throw error;
    return NextResponse.json({success:true,data:{my_vote:vote,vote_count:data.vote_count}});
  }catch(e){return feedbackError(e);}
}
export async function POST(request:NextRequest,{params}:{params:{id:string}}){return mutate(request,params.id,true);}
export async function DELETE(request:NextRequest,{params}:{params:{id:string}}){return mutate(request,params.id,false);}
