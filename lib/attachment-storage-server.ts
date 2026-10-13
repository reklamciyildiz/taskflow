import "server-only";
import { AwsClient } from "aws4fetch";

export function attachmentStorageConfigured() {
  return [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ].every((key) => Boolean(process.env[key]));
}
function storage() {
  if (!attachmentStorageConfigured())
    throw new Error("File storage is not configured.");
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
}
function objectUrl(key: string) {
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${encodeURIComponent(process.env.R2_BUCKET!)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
export async function signedObjectUrl(
  key: string,
  method: "GET" | "PUT",
  mime?: string,
  filename?: string,
  size?: number,
) {
  const client = storage();
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", "120");
  if (filename) {
    url.searchParams.set(
      "response-content-disposition",
      `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
  }
  const request = await client.sign(url.toString(), {
    method,
    headers: mime
      ? {
          "Content-Type": mime,
          ...(size ? { "Content-Length": String(size) } : {}),
        }
      : undefined,
    aws: { signQuery: true, allHeaders: true },
  });
  return request.url;
}
export async function storageRequest(
  key: string,
  method: string,
  body?: Uint8Array,
  mime?: string,
) {
  const response = await storage().fetch(objectUrl(key), {
    method,
    body,
    headers: mime
      ? { "Content-Type": mime, "Cache-Control": "private, no-store" }
      : undefined,
  });
  if (!response.ok && !(method === "DELETE" && response.status === 404))
    throw new Error(`Storage operation failed (${response.status}).`);
  return response;
}
