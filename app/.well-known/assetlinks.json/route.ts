import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const actiprocPackageName = 'com.actiproc.app';
const actiprocFingerprints = [
  'AB:BD:C5:FA:06:0F:9F:62:B3:2B:2C:9D:06:9E:5A:B0:FF:14:06:3F:34:D0:E8:28:F0:5F:68:9F:D3:4A:DD:A0',
];

const actiprocDevPackageName = 'com.actiproc.app.dev';
const actiprocDevFingerprints = [
  '2C:65:2C:AF:1C:A4:88:39:4E:D1:5B:1F:93:34:4D:9E:2A:39:D0:A0:C9:F0:A7:DD:AE:9B:86:4C:CB:A7:54:D3',
  'AB:BD:C5:FA:06:0F:9F:62:B3:2B:2C:9D:06:9E:5A:B0:FF:14:06:3F:34:D0:E8:28:F0:5F:68:9F:D3:4A:DD:A0',
];

const legacyTwaPackageName = 'com.axiomproductivity.twa.diagnostic';
const legacyTwaFingerprints = [
  'AB:BD:C5:FA:06:0F:9F:62:B3:2B:2C:9D:06:9E:5A:B0:FF:14:06:3F:34:D0:E8:28:F0:5F:68:9F:D3:4A:DD:A0',
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

  const statements = [
    createStatement(actiprocPackageName, actiprocFingerprints),
    createStatement(actiprocDevPackageName, actiprocDevFingerprints),
    createStatement(legacyTwaPackageName, legacyTwaFingerprints),
  ];
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
