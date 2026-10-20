import { NextResponse } from 'next/server';
import { mobileAuthEnabled } from '@/lib/mobile-auth/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!mobileAuthEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const packageName = process.env.MOBILE_ANDROID_PACKAGE_ID?.trim();
  const fingerprints = (process.env.MOBILE_ANDROID_CERT_SHA256 ?? '')
    .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (!packageName || !/^[a-zA-Z][a-zA-Z0-9_.]+$/.test(packageName)
    || fingerprints.length === 0
    || fingerprints.some((value) => !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))) {
    return NextResponse.json({ error: 'Not configured' }, { status: 404 });
  }
  return NextResponse.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
  }], { headers: { 'Cache-Control': 'public, max-age=300' } });
}
