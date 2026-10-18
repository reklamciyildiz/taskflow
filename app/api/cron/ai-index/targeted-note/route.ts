import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { aiBetaOrganizationIds,aiBetaUserIds,isAIBetaModeEnabled } from '@/lib/ai/beta-access';
import { processTargetedAINoteIndexJob } from '@/lib/ai/indexing/indexing-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ''}`);
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  if (!process.env.CRON_SECRET || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.AI_TARGETED_NOTE_INDEXING_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Targeted Note indexing is not enabled' }, { status: 503 });
  }
  if (!isAIBetaModeEnabled()) {
    return NextResponse.json({ error: 'Targeted Note indexing requires beta mode' }, { status: 503 });
  }
  const users = aiBetaUserIds();
  const organizations = aiBetaOrganizationIds();
  if (users.length !== 1 || organizations.length !== 1) {
    return NextResponse.json({ error: 'Targeted Note indexing requires one beta user and organization' }, { status: 503 });
  }

  let body: { jobId?: unknown; noteId?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const jobId = Number(body.jobId);
  const noteId = typeof body.noteId === 'string' ? body.noteId.trim().toLowerCase() : '';
  if (!Number.isSafeInteger(jobId) || jobId < 1 || !UUID_PATTERN.test(noteId)) {
    return NextResponse.json({ error: 'Invalid targeted Note identifiers' }, { status: 400 });
  }

  const result = await processTargetedAINoteIndexJob({
    jobId,
    noteId,
    userId: users[0],
    organizationId: organizations[0],
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
