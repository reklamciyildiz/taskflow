import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { pushSubscriptionDb, userDb } from '@/lib/db';

type Body = { endpoint?: string };

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user: any = await userDb.getByEmail(session.user.email);
    if (!user?.id) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.endpoint) {
      return NextResponse.json({ success: false, error: 'endpoint is required' }, { status: 400 });
    }

    await pushSubscriptionDb.revokeForUser(body.endpoint, user.id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

