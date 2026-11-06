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
  try {
    const result = await processAIIndexJobs({
      batchSize: CRON_BATCH_SIZE,
      timeBudgetMs: CRON_TIME_BUDGET_MS,
    });
    // cron-job.org considers a 200 response successful even if individual
    // indexing jobs failed. Surface actual batch failures to alerting while
    // retaining the existing result fields for operational inspection.
    const failed = result.failed > 0;
    return NextResponse.json(
      { ...result, ok: !failed },
      {
        status: failed ? 503 : 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    // Never leak provider/DB errors, queue contents or job metadata to
    // cron-job.org's stored response history.
    console.error('AI indexing cron execution failed');
    return NextResponse.json(
      { ok: false, error: 'AI indexing cron failed' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
