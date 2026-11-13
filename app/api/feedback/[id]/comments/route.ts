import {NextRequest,NextResponse} from 'next/server';
import {cleanFeedbackText} from '@/lib/feedback/contract';
import {activeFeedbackPost,feedbackActor,feedbackDb,feedbackError,feedbackMutationOrigin} from '@/lib/feedback/server';

export async function POST(request:NextRequest,{params}:{params:{id:string}}) {
  const origin=feedbackMutationOrigin(request);if(origin)return origin;
  try{
    const actor=await feedbackActor(request);if(actor instanceof NextResponse)return actor;
    const post=await activeFeedbackPost(params.id);
    if(!post||post.moderation!=='approved'||post.merged_into_id)
      return NextResponse.json({success:false,error:'Bu öneriye yorum yapılamıyor.'},{status:404});
    const json=await request.json().catch(()=>null);
    const body=cleanFeedbackText(json?.body,2,1200);
    if(!body)return NextResponse.json({success:false,error:'Yorum 2–1200 karakter olmalı.'},{status:400});
    const {data,error}=await feedbackDb.from('feedback_comments')
      .insert({post_id:params.id,author_user_id:actor.id,body}).select('id').single();
    if(error)throw error;
    return NextResponse.json({success:true,data:{id:data.id,moderation:'pending'},
      message:'Yorumun incelendikten sonra yayınlanacak.'},{status:201});
  }catch(e){return feedbackError(e);}
}
