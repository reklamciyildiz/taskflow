import { NextRequest } from 'next/server';
import { authenticateMobileRequest, mobileErrorResponse, mobileJson, mobileOptions, publicMobileUser } from '@/lib/mobile-auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }
export async function GET(request: NextRequest) {
  try {
    const authed = await authenticateMobileRequest(request);
    return mobileJson(request, { success: true, data: { user: publicMobileUser(authed.user) } });
  } catch (error) { return mobileErrorResponse(request, error); }
}
