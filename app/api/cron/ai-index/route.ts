import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processAIIndexJobs } from '@/lib/ai/indexing/indexing-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CRON_BATCH_SIZE = 2;
const CRON_TIME_BUDGET_MS = 20_000;

export async function GET(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ''}`);
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  if (!process.env.CRON_SECRET || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // cron-job.org closes requests after 30 seconds. Keep enough headroom for
  // queue-health bookkeeping and the response to travel back to the scheduler.
  const result = await processAIIndexJobs({
    batchSize: CRON_BATCH_SIZE,
    timeBudgetMs: CRON_TIME_BUDGET_MS,
  });
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
