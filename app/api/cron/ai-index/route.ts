import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { processAIIndexJobs } from '@/lib/ai/indexing/indexing-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET ?? ''}`);
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  if (!process.env.CRON_SECRET || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processAIIndexJobs();
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
