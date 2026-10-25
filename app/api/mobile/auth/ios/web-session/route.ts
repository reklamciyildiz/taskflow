import { NextRequest } from 'next/server';
import { createMobileWebSession } from '@/lib/mobile-auth/web-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return createMobileWebSession(request, 'ios');
}
