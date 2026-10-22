import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const bundleId = 'com.axiomproductivity.ios';

export async function GET() {
  const teamId = process.env.APPLE_APP_TEAM_ID?.trim().toUpperCase();
  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId)) {
    return NextResponse.json({ error: 'Not configured' }, { status: 404 });
  }

  const appID = `${teamId}.${bundleId}`;
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [{
        appID,
        components: [{
          '/': '/mobile/auth/callback',
          comment: 'Axiom iOS OAuth callback',
        }],
      }],
    },
    webcredentials: {
      apps: [appID],
    },
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'application/json',
    },
  });
}
