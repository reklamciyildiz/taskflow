import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteConversation,getConversation,getConversationMessages,updateConversationTitle } from '@/lib/ai/chat/conversation-server';
import { chatErrorResponse,requireAIChatUser } from '@/lib/ai/chat/http-server';

export const runtime='nodejs';
const idSchema=z.string().uuid();
const patchSchema=z.object({ title:z.string().trim().min(1).max(120) }).strict();

export async function GET(_request:NextRequest,{ params }:{ params:{ id:string } }) {
  const scope=await requireAIChatUser(); if (scope instanceof NextResponse) return scope;
  if (!idSchema.safeParse(params.id).success) return NextResponse.json({ error:{ code:'INVALID_REQUEST',message:'Invalid conversation' } },{ status:400 });
  try { return NextResponse.json({ conversation:await getConversation(scope,params.id),messages:await getConversationMessages(scope,params.id) }); }
  catch(error) { return chatErrorResponse(error); }
}

export async function PATCH(request:NextRequest,{ params }:{ params:{ id:string } }) {
  const scope=await requireAIChatUser(); if (scope instanceof NextResponse) return scope;
  const parsed=patchSchema.safeParse(await request.json().catch(()=>null));
  if (!idSchema.safeParse(params.id).success || !parsed.success) return NextResponse.json({ error:{ code:'INVALID_REQUEST',message:'Invalid conversation update' } },{ status:400 });
  try { return NextResponse.json({ conversation:await updateConversationTitle(scope,params.id,parsed.data.title) }); }
  catch(error) { return chatErrorResponse(error); }
}

export async function DELETE(_request:NextRequest,{ params }:{ params:{ id:string } }) {
  const scope=await requireAIChatUser(); if (scope instanceof NextResponse) return scope;
  if (!idSchema.safeParse(params.id).success) return NextResponse.json({ error:{ code:'INVALID_REQUEST',message:'Invalid conversation' } },{ status:400 });
  try { await deleteConversation(scope,params.id); return new NextResponse(null,{ status:204 }); }
  catch(error) { return chatErrorResponse(error); }
}
