import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { areAIWriteToolsEnabled } from '@/lib/ai/chat/config';
import { requireAIChatUser } from '@/lib/ai/chat/http-server';
import { approveAIWriteProposal, AIWriteExecutionError, rejectAIWriteProposal } from '@/lib/ai/agent/write-execution-server';

export const runtime = 'nodejs';
const bodySchema = z.object({ conversationId: z.string().uuid(), action: z.enum(['approve', 'reject']) }).strict();

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const scope = await requireAIChatUser(); if (scope instanceof NextResponse) return scope;
  if (!areAIWriteToolsEnabled()) return NextResponse.json({ error: { code: 'WRITE_TOOLS_DISABLED', message: 'AI write tools are not enabled' } }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(params.id).success) {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'Invalid proposal request' } }, { status: 400 });
  }
  try {
    const commandScope = { userId: scope.userId, organizationId: scope.organizationId, conversationId: parsed.data.conversationId };
    const proposal = parsed.data.action === 'approve'
      ? await approveAIWriteProposal(params.id, commandScope)
      : await rejectAIWriteProposal(params.id, commandScope);
    return NextResponse.json({ proposal });
  } catch (error) {
    if (error instanceof AIWriteExecutionError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error(JSON.stringify({ event: 'ai_write_proposal_failed', proposalId: params.id }));
    return NextResponse.json({ error: { code: 'UNAVAILABLE', message: 'The proposal could not be processed' } }, { status: 500 });
  }
}
