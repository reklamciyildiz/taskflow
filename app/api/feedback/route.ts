import {NextRequest,NextResponse} from 'next/server';
import {cleanFeedbackText,FEEDBACK_AREAS,FEEDBACK_CATEGORIES,FEEDBACK_STATUSES,isOneOf} from '@/lib/feedback/contract';
import {feedbackActor,feedbackDb,feedbackError,feedbackMutationOrigin,isFeedbackStaff,decorateFeedbackPosts} from '@/lib/feedback/server';

export const dynamic='force-dynamic';

export async function GET(request:NextRequest) {
  try {
    const actor=await feedbackActor(request);
    if(actor instanceof NextResponse) return actor;
    const url=new URL(request.url);
    const scope=url.searchParams.get('scope')==='mine'?'mine':'all';
    const sort=url.searchParams.get('sort')==='new'?'new':'popular';
    const status=url.searchParams.get('status');
    const category=url.searchParams.get('category');
    const pageRaw=Number(url.searchParams.get('page')||0);
    const page=Number.isInteger(pageRaw)?Math.max(0,Math.min(100,pageRaw)):0;
    const query=(url.searchParams.get('q')||'').trim().slice(0,80);
    let db=feedbackDb.from('feedback_posts')
      .select('id,title,description,category,area,status,moderation,merged_into_id,vote_count,comment_count,created_at,updated_at,author_user_id');
    if(scope==='mine') db=db.eq('author_user_id',actor.id);
    else db=db.eq('moderation','approved').is('merged_into_id',null);
    if(isOneOf(status,FEEDBACK_STATUSES)) db=db.eq('status',status);
    if(isOneOf(category,FEEDBACK_CATEGORIES)) db=db.eq('category',category);
    if(query) db=db.ilike('title','%'+query.replace(/[%_\\]/g,'\\$&')+'%');
    db=sort==='new'?db.order('created_at',{ascending:false}):
      db.order('vote_count',{ascending:false}).order('created_at',{ascending:false});
    const {data,error}=await db.range(page*20,page*20+20);
    if(error) throw error;
    return NextResponse.json({success:true,data:{
      posts:await decorateFeedbackPosts((data||[]).slice(0,20),actor.id),
      hasMore:(data||[]).length>20,isStaff:isFeedbackStaff(actor),
    }},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return feedbackError(error);}
}

export async function POST(request:NextRequest) {
  const origin=feedbackMutationOrigin(request);if(origin) return origin;
  try {
    const actor=await feedbackActor(request);
    if(actor instanceof NextResponse) return actor;
    const body=await request.json().catch(()=>null);
    const title=cleanFeedbackText(body?.title,8,140);
    const description=cleanFeedbackText(body?.description,20,4000);
    const category=body?.category;
    const area=body?.area;
    if(!title||!description||!isOneOf(category,FEEDBACK_CATEGORIES)||!isOneOf(area,FEEDBACK_AREAS)) {
      return NextResponse.json({success:false,error:'Başlık, açıklama veya kategori geçersiz.'},{status:400});
    }
    const {data,error}=await feedbackDb.from('feedback_posts').insert({
      author_user_id:actor.id,organization_id:actor.organization_id,
      title,description,category,area,
    }).select('id').single();
    if(error) throw error;
    return NextResponse.json({success:true,data:{id:data.id,moderation:'pending'},
      message:'Önerin alındı. İncelendikten sonra toplulukta yayınlanacak.'},{status:201});
  }catch(error){return feedbackError(error);}
}
