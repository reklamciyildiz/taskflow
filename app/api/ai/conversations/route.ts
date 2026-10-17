import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { createConversation,listConversations } from '@/lib/ai/chat/conversation-server';
import { chatErrorResponse,requireAIChatUser } from '@/lib/ai/chat/http-server';

export const runtime='nodejs';
const createSchema=z.object({ context:z.object({
  origin:z.enum(['global','knowledge_hub']).default('global'),teamId:z.string().uuid().optional(),
  processId:z.string().uuid().optional(),
}).strict().default({ origin:'global' }) }).strict();

export async function GET() {
  const scope=await requireAIChatUser(); if (scope instanceof NextResponse) return scope;
  try { return NextResponse.json({ conversations:await listConversations(scope) }); }
  catch(error) { return chatErrorResponse(error); }
}

export async function POST(request:NextRequest) {
  const scope=await requireAIChatUser(); if (scope instanceof NextResponse) return scope;
  try {
    const parsed=createSchema.safeParse(await request.json().catch(()=>({})));
    if (!parsed.success) return NextResponse.json({ error:{ code:'INVALID_REQUEST',message:'Invalid conversation context' } },{ status:400 });
    return NextResponse.json({ conversation:await createConversation(scope,parsed.data.context) },{ status:201 });
  } catch(error) { return chatErrorResponse(error); }
}
