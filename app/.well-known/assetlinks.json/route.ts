import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const twaPackageName = 'com.axiomproductivity.twa.diagnostic';
const twaFingerprints = [
  '84:AA:DF:BF:CF:2B:F3:20:DD:C8:9D:53:E0:0E:4D:78:6D:A0:9B:D8:22:F7:40:A3:16:09:DF:BC:8E:38:3C:A8',
];

type AssetLinkStatement = {
  relation: string[];
  target: {
    namespace: 'android_app';
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
};

function createStatement(packageName: string, fingerprints: string[]): AssetLinkStatement {
  return {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  };
}

export async function GET() {
  const packageName = process.env.MOBILE_ANDROID_PACKAGE_ID?.trim();
  const fingerprints = (process.env.MOBILE_ANDROID_CERT_SHA256 ?? '')
    .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);

  const statements = [createStatement(twaPackageName, twaFingerprints)];
  const existingMobileEntryIsValid = Boolean(
    packageName
      && /^[a-zA-Z][a-zA-Z0-9_.]+$/.test(packageName)
      && fingerprints.length > 0
      && fingerprints.every((value) => /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value)),
  );

  if (existingMobileEntryIsValid) {
    statements.unshift(createStatement(packageName!, fingerprints));
  }

  return NextResponse.json(statements, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
