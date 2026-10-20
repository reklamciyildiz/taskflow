import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { userDb } from '@/lib/db';
import { consumeMobileAuthRateLimit, issueMobileSession, mobileAuthEnabled, MobileAuthError, mobileErrorResponse, mobileJson, mobileOptions } from '@/lib/mobile-auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }

export async function POST(request: NextRequest) {
  try {
    if (!mobileAuthEnabled()) throw new MobileAuthError('FEATURE_DISABLED', 404, 'Not found.');
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const platform = body?.platform === 'ios' ? 'ios' : 'android';
    if (!email || !password) throw new MobileAuthError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect.');
    await consumeMobileAuthRateLimit(request, 'credentials', email);
    const user: any = await userDb.getByEmail(email);
    const valid = user?.password_hash ? await bcrypt.compare(password, String(user.password_hash)) : false;
    if (!valid) throw new MobileAuthError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect.');
    const data = await issueMobileSession({ user, platform, deviceId: typeof body?.deviceId === 'string' ? body.deviceId : null });
    return mobileJson(request, { success: true, data });
  } catch (error) { return mobileErrorResponse(request, error); }
}
