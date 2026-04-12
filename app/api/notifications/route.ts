import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { notificationDb, userDb } from '@/lib/db';

// GET - Get notifications for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user: any = await userDb.getByEmail(session.user.email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const parsed = rawLimit != null ? parseInt(rawLimit, 10) : 20;
    const limit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 20;

    const [notifications, unreadCount] = await Promise.all([
      notificationDb.getByUser(user.id, limit),
      notificationDb.getUnreadCount(user.id),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error: any) {
    console.error('Get notifications error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Mark notification(s) as read
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user: any = await userDb.getByEmail(session.user.email);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    let body: { action?: string; notificationId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { action, notificationId } = body;

    if (action === 'markAllRead') {
      await notificationDb.markAllAsRead(user.id);
      return NextResponse.json({
        success: true,
        message: 'All notifications marked as read',
      });
    }

    if (action === 'markRead' && notificationId) {
      const row = await notificationDb.markAsReadForUser(notificationId, user.id);
      if (!row) {
        return NextResponse.json(
          { success: false, error: 'Notification not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        message: 'Notification marked as read',
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Update notification error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
