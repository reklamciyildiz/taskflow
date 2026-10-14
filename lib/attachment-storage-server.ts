import "server-only";
import { AwsClient } from "aws4fetch";

const AWS4FETCH_RETRY_LIMIT = 10;

function safeToken(value: string | null | undefined, max = 128) {
  if (!value) return null;
  const token = value.trim().slice(0, max);
  return /^[A-Za-z0-9._:/-]+$/.test(token) ? token : null;
}

export class StorageRequestError extends Error {
  readonly status: number | null;
  readonly upstreamRequestId: string | null;
  readonly upstreamCode: string | null;
  readonly retryCount: number | null;
  readonly retryLimit = AWS4FETCH_RETRY_LIMIT;

  constructor({
    status = null,
    upstreamRequestId = null,
    upstreamCode = null,
    retryCount = null,
    cause,
  }: {
    status?: number | null;
    upstreamRequestId?: string | null;
    upstreamCode?: string | null;
    retryCount?: number | null;
    cause?: unknown;
  }) {
    super("Private object storage request failed.", { cause });
    this.name = "StorageRequestError";
    this.status = status;
    this.upstreamRequestId = safeToken(upstreamRequestId);
    this.upstreamCode = safeToken(upstreamCode, 64);
    this.retryCount = retryCount;
  }
}

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
  body?: Uint8Array | ArrayBuffer,
  mime?: string,
) {
  const byteBody =
    body instanceof ArrayBuffer ? new Uint8Array(body) : body;
  const headers = new Headers();
  if (mime) {
    headers.set("Content-Type", mime);
    headers.set("Cache-Control", "private, no-store");
  }
  // Vercel's server fetch may otherwise send Uint8Array bodies using chunked
  // transfer encoding. R2's S3 endpoint requires a concrete length for PUT.
  // Use the final processed body's byte length, never the original upload size.
  if (method === "PUT" && byteBody)
    headers.set("Content-Length", String(byteBody.byteLength));
  let response: Response;
  try {
    response = await storage().fetch(objectUrl(key), {
      method,
      body: byteBody,
      headers,
    });
  } catch (error) {
    throw new StorageRequestError({
      upstreamCode:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : null,
      cause: error,
    });
  }
  if (!response.ok && !(method === "DELETE" && response.status === 404)) {
    let upstreamCode = response.headers.get("x-amz-error-code");
    if (!upstreamCode) {
      const errorDocument = await response
        .clone()
        .text()
        .catch(() => "");
      upstreamCode =
        /<Code>([A-Za-z0-9._:-]{1,64})<\/Code>/.exec(
          errorDocument.slice(0, 4096),
        )?.[1] ?? null;
    }
    throw new StorageRequestError({
      status: response.status,
      upstreamRequestId:
        response.headers.get("cf-ray") ??
        response.headers.get("x-amz-request-id"),
      upstreamCode,
      // aws4fetch does not expose attempts. A final retryable response means
      // its configured/default retry budget was exhausted; otherwise unknown.
      retryCount:
        response.status === 429 || response.status >= 500
          ? AWS4FETCH_RETRY_LIMIT
          : null,
    });
  }
  return response;
}
