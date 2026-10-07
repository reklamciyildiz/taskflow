import { NextRequest, NextResponse } from 'next/server';
import { noteDb } from '@/lib/db';
import type { ApiResponse } from '@/lib/types';
import {
  isNoteType,
  isTipTapDocument,
  requireNoteAccess,
  serializeNote,
} from '@/lib/note-server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const access = await requireNoteAccess(params.id, { mutate: true });
    if (access instanceof NextResponse) return access;

    const body = await request.json();
    const updates: { title?: string; type?: any; content?: any } = {};

    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'title')) {
      if (typeof body.title !== 'string' || body.title.trim().length > 240) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Note title must be 240 characters or fewer' },
          { status: 400 },
        );
      }
      updates.title = body.title.trim();
    }
    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'type')) {
      if (!isNoteType(body.type)) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Invalid note type' },
          { status: 400 },
        );
      }
      updates.type = body.type;
    }
    if (Object.prototype.hasOwnProperty.call(body ?? {}, 'content')) {
      if (!isTipTapDocument(body.content)) {
        return NextResponse.json<ApiResponse<null>>(
          { success: false, error: 'Invalid note content' },
          { status: 400 },
        );
      }
      updates.content = body.content;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'No valid note fields supplied' },
        { status: 400 },
      );
    }

    const note = await noteDb.update(params.id, updates);
    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: serializeNote(note),
    });
  } catch (error) {
    console.error('Error updating action note:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const access = await requireNoteAccess(params.id, { mutate: true });
    if (access instanceof NextResponse) return access;

    const deleted = await noteDb.delete(params.id, {
      organizationId: String((access.note as any).organization_id),
      teamId: String((access.note as any).team_id),
    });
    if (!deleted) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Note not found' },
        { status: 404 },
      );
    }
    return NextResponse.json<ApiResponse<null>>({ success: true, data: null });
  } catch (error) {
    console.error('Error deleting action note:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
