import "server-only";
import { createHash, randomUUID } from "crypto";
import sharp from "sharp";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin as db } from "@/lib/supabase-admin";
import { requireTaskNoteAccess } from "@/lib/note-server";
import {
  signatureMatches,
  validateAttachmentInput,
  type AttachmentTarget,
} from "@/lib/attachments";
import {
  signedObjectUrl,
  storageRequest,
} from "@/lib/attachment-storage-server";
import { stripImageMetadata } from "@/lib/image-metadata";

export class AttachmentError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireAttachmentOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.NEXTAUTH_URL || request.url).origin;
  if (origin && origin !== expected)
    throw new AttachmentError("Forbidden request origin.", 403);
}
function checked<T extends { error: any }>(result: T): T {
  if (result.error)
    throw new AttachmentError(
      "File operation failed. Retry or contact your administrator.",
      409,
    );
  return result;
}
export async function attachmentTargetAccess(
  target: AttachmentTarget,
  mutate: boolean,
) {
  if (!target?.taskId || (target.noteId && target.checklistItemId))
    throw new AttachmentError("Invalid file destination.");
  const access = await requireTaskNoteAccess(target.taskId, { mutate });
  if (access instanceof NextResponse) return access;
  if (target.noteId) {
    const note = checked(
      await db
        .from("notes")
        .select("id")
        .eq("id", target.noteId)
        .eq("task_id", target.taskId)
        .maybeSingle(),
    ).data;
    if (!note) throw new AttachmentError("Note not found.", 404);
  }
  if (target.checklistItemId) {
    const contains = (node: any): boolean =>
      (node?.type === "taskItem" &&
        node.attrs?.id === target.checklistItemId) ||
      (Array.isArray(node?.content) && node.content.some(contains));
    if (!contains(access.task.checklist_blocks))
      throw new AttachmentError(
        "Save the checklist item before attaching files.",
        409,
      );
  }
  return access;
}
export async function attachmentAccess(id: string, mutate: boolean) {
  const file = checked(
    await db.from("attachments").select("*").eq("id", id).maybeSingle(),
  ).data;
  if (!file?.task_id) throw new AttachmentError("File not found.", 404);
  const access = await attachmentTargetAccess({ taskId: file.task_id }, mutate);
  if (access instanceof NextResponse) return access;
  if (
    file.organization_id !== access.task.organization_id ||
    file.team_id !== access.task.team_id
  )
    throw new AttachmentError("File not found.", 404);
  return { ...access, file };
}
export async function beginAttachment(
  access: any,
  target: AttachmentTarget,
  input: any,
) {
  const filename = validateAttachmentInput(
    String(input.filename ?? ""),
    input.mimeType,
    input.size,
  );
  if (
    input.mimeType === "application/pdf" &&
    (!process.env.ATTACHMENT_SCANNER_URL?.startsWith("https://") ||
      !process.env.ATTACHMENT_SCANNER_TOKEN)
  )
    throw new AttachmentError(
      "PDF uploads are unavailable until document security scanning is configured.",
      503,
    );
  const id = randomUUID();
  const prefix = `${access.task.organization_id}/${id}`;
  const file = {
    id,
    task_id: target.taskId,
    organization_id: access.task.organization_id,
    team_id: access.task.team_id,
    uploaded_by: access.user.id,
    filename,
    mime_type: input.mimeType,
    size_bytes: input.size,
    staging_key: `pending/${prefix}`,
    object_key: `files/${prefix}/document`,
    thumbnail_key: `files/${prefix}/thumbnail`,
  };
  // Database trigger serializes organization quota reservations, including in-flight uploads.
  const inserted = await db.from("attachments").insert(file);
  if (inserted.error) {
    if (/quota|Upload limit/.test(inserted.error.message))
      throw new AttachmentError(inserted.error.message, 429);
    checked(inserted);
  }
  const links: any[] = [{ attachment_id: id, task_id: target.taskId }];
  if (target.noteId || target.checklistItemId)
    links.push({
      attachment_id: id,
      task_id: target.taskId,
      note_id: target.noteId,
      checklist_item_id: target.checklistItemId,
    });
  checked(await db.from("attachment_links").insert(links));
  return {
    id,
    uploadUrl: await signedObjectUrl(
      file.staging_key,
      "PUT",
      file.mime_type,
      undefined,
      file.size_bytes,
    ),
    expiresIn: 120,
  };
}

async function boundedObject(key: string, expectedSize: number) {
  const head = await storageRequest(key, "HEAD");
  if (Number(head.headers.get("content-length")) !== expectedSize)
    throw new AttachmentError("Uploaded file size does not match.");
  const response = await storageRequest(key, "GET");
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > expectedSize)
        throw new AttachmentError("Uploaded file is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  if (total !== expectedSize) throw new AttachmentError("Incomplete upload.");
  return Buffer.concat(chunks);
}
export async function processAttachmentBytes(bytes: Buffer, mime: string) {
  if (!signatureMatches(bytes, mime))
    throw new AttachmentError(
      "File contents do not match the declared format.",
    );
  if (mime === "application/pdf") {
    const scanner = process.env.ATTACHMENT_SCANNER_URL;
    if (
      !scanner ||
      !scanner.startsWith("https://") ||
      !process.env.ATTACHMENT_SCANNER_TOKEN
    )
      throw new AttachmentError(
        "Document security scanning is unavailable.",
        503,
      );
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const result = await fetch(scanner, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": mime,
        Authorization: `Bearer ${process.env.ATTACHMENT_SCANNER_TOKEN}`,
      },
      body: bytes,
      signal: AbortSignal.timeout(25000),
    });
    const scan = result.ok ? await result.json() : null;
    if (scan?.verdict !== "clean" || scan?.sha256 !== checksum)
      throw new AttachmentError(
        "Document security scan did not approve this PDF.",
      );
    return { bytes, mime, thumbnail: null, width: null, height: null };
  }
  const image = sharp(bytes, {
    limitInputPixels: 24_000_000,
    failOn: "error",
    animated: true,
  });
  const meta = await image.metadata();
  if ((meta.pages ?? 1) > 1)
    throw new AttachmentError("Animated images are not supported.");
  // Re-encode without EXIF/XMP. No downscaling of the document; lossless WebP
  // preserves screenshot/diagram text and alpha. Use native sanitized encoding if smaller.
  const rotated = image.rotate();
  // Lossless fallback preserves original compressed pixels, dropping EXIF/XMP/IPTC.
  const native = stripImageMetadata(bytes, mime, meta.orientation);
  const webp = await rotated
    .clone()
    .webp({ lossless: true, effort: 3 })
    .toBuffer();
  const useWebp = webp.length < native.length;
  const thumbnail = await rotated
    .clone()
    .resize({
      width: 384,
      height: 384,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  const rotatedDimensions = (meta.orientation ?? 1) >= 5;
  return {
    bytes: useWebp ? webp : native,
    mime: useWebp ? "image/webp" : mime,
    thumbnail,
    width: rotatedDimensions ? meta.height! : meta.width!,
    height: rotatedDimensions ? meta.width! : meta.height!,
  };
}
export async function finalizeAttachment(file: any) {
  if (file.status === "ready") return { id: file.id };
  if (file.status !== "pending")
    throw new AttachmentError(
      "Upload is processing or no longer available.",
      409,
    );
  const claim = checked(
    await db
      .from("attachments")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", file.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle(),
  ).data;
  if (!claim) throw new AttachmentError("Upload is already processing.", 409);
  try {
    const bytes = await boundedObject(
      file.staging_key,
      Number(file.size_bytes),
    );
    const processed = await processAttachmentBytes(bytes, file.mime_type);
    // Keys exposed by PUT are never served. Validated content has a separate immutable key.
    await storageRequest(
      file.object_key,
      "PUT",
      processed.bytes,
      processed.mime,
    );
    if (processed.thumbnail)
      await storageRequest(
        file.thumbnail_key,
        "PUT",
        processed.thumbnail,
        "image/webp",
      );
    const ready = checked(
      await db
        .from("attachments")
        .update({
          status: "ready",
          mime_type: processed.mime,
          stored_bytes:
            processed.bytes.length + (processed.thumbnail?.length ?? 0),
          width: processed.width,
          height: processed.height,
          thumbnail_key: processed.thumbnail ? file.thumbnail_key : null,
          checksum: createHash("sha256").update(processed.bytes).digest("hex"),
          updated_at: new Date().toISOString(),
        })
        .eq("id", file.id)
        .eq("status", "processing")
        .eq("task_id", file.task_id)
        .select("id")
        .maybeSingle(),
    ).data;
    if (!ready)
      throw new AttachmentError(
        "Upload destination is no longer available.",
        409,
      );
    // Pending prefix also has a bucket lifecycle rule: a still-live PUT may recreate it.
    await storageRequest(file.staging_key, "DELETE").catch(() => undefined);
    return { id: file.id };
  } catch (error) {
    await db
      .from("attachments")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", file.id)
      .eq("status", "processing");
    throw error;
  }
}
export async function cleanupAttachments() {
  const files = checked(await db.rpc("claim_attachment_cleanup")).data ?? [];
  let deleted = 0;
  for (const file of files) {
    try {
      for (const key of [
        file.staging_key,
        file.object_key,
        file.thumbnail_key,
      ].filter(Boolean))
        await storageRequest(key, "DELETE");
      checked(
        await db
          .from("attachments")
          .delete()
          .eq("id", file.id)
          .eq("status", "deleting"),
      );
      deleted++;
    } catch {
      /* Lease expires; next cleanup retries all deterministic keys. */
    }
  }
  return { claimed: files.length, deleted };
}
export function attachmentFailure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof AttachmentError ||
        (error instanceof Error && /Choose a|must be under/.test(error.message))
          ? (error as Error).message
          : "File operation failed. Please retry.",
    },
    {
      status: error instanceof AttachmentError ? error.status : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
