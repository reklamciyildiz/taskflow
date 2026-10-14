import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabase-admin";
import {
  attachmentFailure,
  attachmentTargetAccess,
  beginAttachment,
  requireAttachmentOrigin,
  isUnscannedBetaPdf,
} from "@/lib/attachment-server";
import { attachmentStorageConfigured } from "@/lib/attachment-storage-server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const target = { taskId: request.nextUrl.searchParams.get("taskId") ?? "" };
    const access = await attachmentTargetAccess(target, false);
    if (access instanceof NextResponse) return access;
    if (!attachmentStorageConfigured())
      return NextResponse.json(
        { files: [], enabled: false },
        { headers: { "Cache-Control": "no-store" } },
      );
    const offset = Math.max(
      0,
      Number(request.nextUrl.searchParams.get("offset")) || 0,
    );
    const { data, error } = await db
      .from("attachments")
      .select(
        "id,filename,mime_type,size_bytes,width,height,created_at,object_key,links:attachment_links!inner(id,note_id,checklist_item_id)",
      )
      .eq("task_id", target.taskId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 49);
    if (error) throw error;
    return NextResponse.json(
      {
        files: data.map(({ object_key, ...file }) => ({
          ...file,
          preview_allowed: !isUnscannedBetaPdf({
            mime_type: file.mime_type,
            object_key,
          }),
        })),
        enabled: true,
        hasMore: data.length === 50,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return attachmentFailure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    requireAttachmentOrigin(request);
    const body = await request.json();
    const access = await attachmentTargetAccess(body.target, true);
    if (access instanceof NextResponse) return access;
    if (!attachmentStorageConfigured())
      return NextResponse.json(
        { error: "File storage is not configured." },
        { status: 503 },
      );
    return NextResponse.json(await beginAttachment(access, body.target, body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return attachmentFailure(error);
  }
}
