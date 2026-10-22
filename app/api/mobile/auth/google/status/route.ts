import { NextRequest } from 'next/server';
import { mobileGoogleAuthConfigured } from '@/lib/mobile-auth/google';
import { mobileJson, mobileOptions } from '@/lib/mobile-auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }

export async function GET(request: NextRequest) {
  return mobileJson(request, {
    success: true,
    data: { enabled: mobileGoogleAuthConfigured() },
  });
}
