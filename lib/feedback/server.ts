import { NextRequest,NextResponse } from 'next/server';
import { requireAuthedUser } from '@/lib/server-authz';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isFeedbackId } from './contract';

export const feedbackDb = supabaseAdmin;
export type FeedbackUser = { id:string; email?:string|null; organization_id?:string|null };

export async function feedbackActor(request:NextRequest):Promise<FeedbackUser|NextResponse> {
  const access=await requireAuthedUser(request);
  if(access instanceof NextResponse) return access;
  if(!access.user.id || !access.user.organization_id)
    return NextResponse.json({success:false,error:'Çalışma alanı bulunamadı.'},{status:403});
  return access.user;
}
// Platform moderation is deliberately NOT granted to each tenant's owner/admin.
export function isFeedbackStaff(user:FeedbackUser):boolean {
  const allowed=(process.env.ACTIPROC_FEEDBACK_ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  return Boolean(user.email && allowed.includes(user.email.toLowerCase()));
}
export function feedbackMutationOrigin(request:NextRequest):NextResponse|null {
  const origin=request.headers.get('origin');
  if(!origin) return null; // Native Bearer sessions may omit Origin.
  try {
    if(new URL(origin).host===new URL(request.url).host) return null;
  } catch { /* fallthrough */ }
  return NextResponse.json({success:false,error:'Geçersiz istek kaynağı.'},{status:403});
}
export function feedbackError(error:unknown):NextResponse {
  const e=error as {code?:string;message?:string};
  if(e?.message?.includes('FEEDBACK_RATE_LIMIT')) return NextResponse.json({success:false,error:'Günlük öneri veya yorum sınırına ulaştın.'},{status:429});
  if(e?.code==='42P01' || e?.code==='42883' || e?.code==='PGRST202')
    return NextResponse.json({success:false,error:'Öneri sistemi henüz kullanıma açılmadı.'},{status:503});
  console.error('Feedback request failed:',e?.code||'unknown');
  return NextResponse.json({success:false,error:'İşlem tamamlanamadı. Lütfen tekrar dene.'},{status:500});
}
export async function activeFeedbackPost(id:unknown) {
  if(!isFeedbackId(id)) return null;
  const {data,error}=await feedbackDb.from('feedback_posts').select('*').eq('id',id).maybeSingle();
  if(error) throw error;
  return data;
}
export async function decorateFeedbackPosts(rows:any[],userId:string) {
  const ids=rows.map(p=>p.id);
  if(ids.length===0) return [];
  const {data,error}=await feedbackDb.from('feedback_votes').select('post_id').eq('user_id',userId).in('post_id',ids);
  if(error) throw error;
  const mine=new Set((data||[]).map(v=>v.post_id));
  return rows.map(p=>({
    id:p.id,title:p.title,description:p.description,category:p.category,area:p.area,
    status:p.status,moderation:p.moderation,merged_into_id:p.merged_into_id,
    vote_count:p.vote_count,comment_count:p.comment_count,created_at:p.created_at,updated_at:p.updated_at,
    my_vote:mine.has(p.id),is_mine:p.author_user_id===userId,
  }));
}
