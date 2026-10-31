import { NextRequest, NextResponse } from 'next/server';
import { commentDb } from '@/lib/db';
import type { ApiResponse } from '@/lib/types';
import { requireTaskNoteAccess } from '@/lib/note-server';

// Both NextAuth web cookies and Capacitor short-lived Bearer sessions resolve
// to the same canonical user and team/Process permission checks.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const access = await requireTaskNoteAccess(params.id, { mutate: true }, undefined, request);
    if (access instanceof NextResponse) return access;
    const body = await request.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Comment text is required' },
        { status: 400 },
      );
    }
    // Never trust a client-supplied authorId, especially across native sessions.
    const comment = await commentDb.create(params.id, String(access.user.id), text);
    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: comment,
      message: 'Comment added successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding comment:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
