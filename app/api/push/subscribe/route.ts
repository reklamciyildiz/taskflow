import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { pushSubscriptionDb, userDb } from '@/lib/db';

type Body = {
  subscription?: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  };
};

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user: any = await userDb.getByEmail(session.user.email);
    if (!user?.id || !user.organization_id) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const sub = body.subscription;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return NextResponse.json({ success: false, error: 'Invalid subscription' }, { status: 400 });
    }

    const row = await pushSubscriptionDb.upsertActive({
      user_id: user.id,
      organization_id: user.organization_id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      expiration_time: sub.expirationTime ?? null,
      user_agent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true, data: { id: row.id } });
  } catch (error: any) {
    console.error('Push subscribe error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

