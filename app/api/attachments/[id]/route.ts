import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabase-admin";
import {
  attachmentAccess,
  attachmentFailure,
  AttachmentError,
  finalizeAttachment,
  requireAttachmentOrigin,
  isUnscannedBetaPdf,
} from "@/lib/attachment-server";
import { signedObjectUrl } from "@/lib/attachment-storage-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const access = await attachmentAccess(params.id, false, request);
    if (access instanceof NextResponse) return access;
    const { file } = access;
    if (file.status !== "ready")
      throw new AttachmentError("File is not available.", 409);
    const { data: links, error } = await db
      .from("attachment_links")
      .select("id")
      .eq("attachment_id", file.id)
      .limit(1);
    if (error || !links?.length)
      throw new AttachmentError("File is no longer attached.", 404);
    const download = request.nextUrl.searchParams.get("download") === "1";
    const publicFile = {
      id: file.id,
      filename: file.filename,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      width: file.width,
      height: file.height,
      preview_allowed: !isUnscannedBetaPdf(file),
    };
    if (isUnscannedBetaPdf(file) && !download)
      return NextResponse.json(
        { url: null, expiresIn: 0, file: publicFile },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const key =
      request.nextUrl.searchParams.get("thumbnail") === "1" &&
      file.thumbnail_key
        ? file.thumbnail_key
        : file.object_key;
    const extension: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "application/pdf": "pdf",
    };
    const filename =
      file.filename.replace(/\.[^.]+$/, "") + "." + extension[file.mime_type];
    return NextResponse.json(
      {
        url: await signedObjectUrl(
          key,
          "GET",
          undefined,
          download ? filename : undefined,
        ),
        expiresIn: 120,
        file: publicFile,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return attachmentFailure(error);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    requireAttachmentOrigin(request);
    const access = await attachmentAccess(params.id, true, request);
    if (access instanceof NextResponse) return access;
    if (access.file.uploaded_by !== access.user.id)
      throw new AttachmentError(
        "Only the uploader can finalize this upload.",
        403,
      );
    return NextResponse.json(await finalizeAttachment(access.file));
  } catch (error) {
    return attachmentFailure(error);
  }
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    requireAttachmentOrigin(request);
    const access = await attachmentAccess(params.id, true, request);
    if (access instanceof NextResponse) return access;
    const body = await request.json();
    const filename =
      typeof body.filename === "string"
        ? body.filename.replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim()
        : "";
    if (!filename || filename.length > 180)
      throw new AttachmentError("Use a filename of 1–180 characters.");
    const { error } = await db
      .from("attachments")
      .update({ filename })
      .eq("id", params.id)
      .eq("status", "ready");
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return attachmentFailure(error);
  }
}
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    requireAttachmentOrigin(request);
    const access = await attachmentAccess(params.id, true, request);
    if (access instanceof NextResponse) return access;
    if (access.file.status !== "ready") {
      if (access.file.uploaded_by !== access.user.id)
        throw new AttachmentError("Forbidden", 403);
      const { error } = await db
        .from("attachments")
        .update({ status: "deleting", updated_at: new Date().toISOString() })
        .eq("id", params.id)
        // Finalize may win after the access check; cancellation must not delete a ready file.
        .in("status", ["pending", "processing"]);
      if (error) throw error;
    } else {
      const linkId = request.nextUrl.searchParams.get("linkId");
      if (!linkId)
        throw new AttachmentError("Specify the file relationship to remove.");
      const { error } = await db
        .from("attachment_links")
        .delete()
        .eq("id", linkId)
        .eq("attachment_id", params.id)
        .is("note_id", null);
      if (error) throw error;
      // Note placements are removed through editor autosave, so Undo remains valid.
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return attachmentFailure(error);
  }
}
