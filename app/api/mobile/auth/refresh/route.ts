import { NextRequest } from 'next/server';
import { mobileAuthEnabled, MobileAuthError, mobileErrorResponse, mobileJson, mobileOptions, rotateMobileSession } from '@/lib/mobile-auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }
export async function POST(request: NextRequest) {
  try {
    if (!mobileAuthEnabled()) throw new MobileAuthError('FEATURE_DISABLED', 404, 'Not found.');
    const body = await request.json().catch(() => null);
    if (typeof body?.refreshToken !== 'string') throw new MobileAuthError('INVALID_REFRESH_TOKEN', 401, 'Refresh token is required.');
    return mobileJson(request, { success: true, data: await rotateMobileSession(body.refreshToken) });
  } catch (error) { return mobileErrorResponse(request, error); }
}
