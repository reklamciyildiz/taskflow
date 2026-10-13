export const ATTACHMENT_ACCEPT =
  "image/png,image/jpeg,image/webp,application/pdf";
export const FILE_LIMIT = 25 * 1024 * 1024;
export const IMAGE_LIMIT = 10 * 1024 * 1024;
export type AttachmentTarget = {
  taskId: string;
  noteId?: string;
  checklistItemId?: string;
};
export type Attachment = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
  links: {
    id: string;
    note_id: string | null;
    checklist_item_id: string | null;
  }[];
};
export function validateAttachmentInput(
  filename: string,
  mime: string,
  size: number,
) {
  const extensions: Record<string, string[]> = {
    "image/png": ["png"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/webp": ["webp"],
    "application/pdf": ["pdf"],
  };
  if (
    !extensions[mime]?.includes(filename.split(".").pop()?.toLowerCase() ?? "")
  )
    throw new Error(
      "Choose a PNG, JPEG, WebP image or PDF with a matching extension.",
    );
  if (
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > (mime === "application/pdf" ? FILE_LIMIT : IMAGE_LIMIT)
  )
    throw new Error("Images must be under 10 MiB and PDFs under 25 MiB.");
  return (
    filename
      .replace(/[\u0000-\u001f\u007f/\\]/g, "_")
      .trim()
      .slice(0, 180) || "file"
  );
}
export function signatureMatches(bytes: Uint8Array, mime: string): boolean {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));
  if (mime === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  if (mime === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/webp")
    return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  return (
    mime === "application/pdf" && /^%PDF-1\.[0-9]|^%PDF-2\.0/.test(ascii(0, 8))
  );
}
