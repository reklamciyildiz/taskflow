import { NextRequest, NextResponse } from 'next/server';
import { noteDb } from '@/lib/db';
import type { ApiResponse } from '@/lib/types';
import {
  EMPTY_NOTE_DOCUMENT,
  isNoteType,
  isTipTapDocument,
  requireTaskNoteAccess,
  serializeNote,
} from '@/lib/note-server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const access = await requireTaskNoteAccess(params.id, { mutate: false });
    if (access instanceof NextResponse) return access;

    const notes = await noteDb.getByTask(params.id);
    return NextResponse.json<ApiResponse<any>>({
      success: true,
      data: notes.map(serializeNote),
    });
  } catch (error) {
    console.error('Error fetching action notes:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const access = await requireTaskNoteAccess(params.id, { mutate: true });
    if (access instanceof NextResponse) return access;

    const body = await request.json();
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const type = body?.type ?? 'note';
    const content = body?.content ?? EMPTY_NOTE_DOCUMENT;

    if (title.length > 240) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Note title must be 240 characters or fewer' },
        { status: 400 },
      );
    }
    if (!isNoteType(type)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid note type' },
        { status: 400 },
      );
    }
    if (!isTipTapDocument(content)) {
      return NextResponse.json<ApiResponse<null>>(
        { success: false, error: 'Invalid note content' },
        { status: 400 },
      );
    }

    const note = await noteDb.create({
      task_id: params.id,
      organization_id: String((access.task as any).organization_id),
      team_id: String((access.task as any).team_id),
      author_id: String(access.user.id),
      title,
      type,
      content: content as any,
    });

    return NextResponse.json<ApiResponse<any>>(
      { success: true, data: serializeNote(note) },
      { status: 201 },
    );
  } catch (error) {
    console.error('Error creating action note:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
