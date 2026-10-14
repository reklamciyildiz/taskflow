"use client";
/* eslint-disable @next/next/no-img-element -- Private short-lived R2 URLs must not enter the public Next image cache. */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  Paperclip,
  X,
  Download,
  RotateCcw,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ATTACHMENT_ACCEPT,
  validateAttachmentInput,
  type Attachment,
  type AttachmentTarget,
} from "@/lib/attachments";

export async function attachmentRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "File operation failed.");
  return body;
}
type Upload = {
  key: string;
  file: File;
  target: AttachmentTarget;
  progress: number;
  error?: string;
  done?: boolean;
  controller: AbortController;
  onReady?: (id: string) => void;
};
type Context = {
  taskId: string;
  canEdit: boolean;
  enabled: boolean;
  files: Attachment[];
  error: string | null;
  load: () => Promise<void>;
  revalidate: () => Promise<void>;
  resolveUrl: (id: string, thumbnail: boolean) => Promise<any>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  upload: (
    files: File[],
    target: AttachmentTarget,
    onReady?: (id: string) => void,
  ) => void;
  open: (file: Attachment) => void;
};
const AttachmentContext = createContext<Context | null>(null);
export const useAttachments = () => useContext(AttachmentContext);
const fetchAttachmentUrl = (id: string, thumbnail: boolean) =>
  attachmentRequest(`/api/attachments/${id}?thumbnail=${thumbnail ? 1 : 0}`);

function putFile(
  url: string,
  file: File,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => {
      xhr.abort();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    const clean = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.timeout = 120000;
    xhr.upload.onprogress = (event) =>
      event.lengthComputable &&
      progress(Math.round((event.loaded / event.total) * 90));
    xhr.onload = () => {
      clean();
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error("Upload failed. Please retry."));
    };
    xhr.onerror = xhr.ontimeout = () => {
      clean();
      reject(new Error("Upload interrupted. Check your connection and retry."));
    };
    xhr.onabort = clean;
    xhr.send(file);
  });
}
export function AttachmentProvider({
  taskId,
  canEdit,
  children,
}: {
  taskId: string;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const active = useRef(true);
  const queue = useRef(Promise.resolve());
  const jobs = useRef(new Map<string, Upload>());
  const inflight = useRef<Promise<void> | null>(null);
  const loadedAt = useRef(0);
  const signedRequests = useRef(new Map<string, Promise<any>>());
  const resolveUrl = useCallback((id: string, thumbnail: boolean) => {
    const key = `${id}:${thumbnail}`;
    const existing = signedRequests.current.get(key);
    if (existing) return existing;
    const request = fetchAttachmentUrl(id, thumbnail).finally(() =>
      signedRequests.current.delete(key),
    );
    signedRequests.current.set(key, request);
    return request;
  }, []);
  const load = useCallback(() => {
    if (inflight.current) return inflight.current;
    const request = attachmentRequest(`/api/attachments?taskId=${taskId}`)
      .then((body) => {
        if (active.current) {
          setFiles(body.files);
          setEnabled(body.enabled);
          setHasMore(body.hasMore);
          setLoadError(null);
          loadedAt.current = Date.now();
        }
      })
      .catch((error) => {
        if (active.current) setLoadError(error.message);
        throw error;
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = request;
    return request;
  }, [taskId]);
  const refresh = useCallback(async () => {
    if (inflight.current) await inflight.current.catch(() => undefined);
    await load();
  }, [load]);
  const revalidate = useCallback(async () => {
    if (Date.now() - loadedAt.current > 15000) await load();
  }, [load]);
  useEffect(() => {
    active.current = true;
    const currentJobs = jobs.current;
    void load().catch(() => undefined);
    return () => {
      active.current = false;
      currentJobs.forEach((job) => job.controller.abort());
    };
  }, [load]);
  const loadMore = async () => {
    const body = await attachmentRequest(
      `/api/attachments?taskId=${taskId}&offset=${files.length}`,
    );
    if (active.current) {
      setFiles((current) => [
        ...current,
        ...body.files.filter(
          (file: Attachment) => !current.some((f) => f.id === file.id),
        ),
      ]);
      setHasMore(body.hasMore);
    }
  };
  const refreshJobs = () => {
    if (active.current) setUploads([...jobs.current.values()]);
  };
  const start = (job: Upload) => {
    queue.current = queue.current.then(async () => {
      if (job.controller.signal.aborted || !active.current) return;
      let attachmentId: string | undefined;
      try {
        validateAttachmentInput(job.file.name, job.file.type, job.file.size);
        const signed = await attachmentRequest("/api/attachments", {
          method: "POST",
          signal: job.controller.signal,
          body: JSON.stringify({
            target: job.target,
            filename: job.file.name,
            mimeType: job.file.type,
            size: job.file.size,
          }),
        });
        attachmentId = signed.id;
        await putFile(
          signed.uploadUrl,
          job.file,
          job.controller.signal,
          (value) => {
            job.progress = value;
            refreshJobs();
          },
        );
        await attachmentRequest(`/api/attachments/${signed.id}`, {
          method: "POST",
          signal: job.controller.signal,
        });
        job.done = true;
        if (active.current) {
          try {
            job.onReady?.(signed.id);
          } catch {
            toast.error(
              "File uploaded to Action Files. Insert it again in your note.",
            );
          }
          await refresh().catch(() =>
            toast.error("File uploaded. Reopen Files to refresh the list."),
          );
        }
        jobs.current.delete(job.key);
      } catch (error) {
        if (attachmentId && !job.done)
          void attachmentRequest(`/api/attachments/${attachmentId}`, {
            method: "DELETE",
          }).catch(() => undefined);
        if (job.controller.signal.aborted) jobs.current.delete(job.key);
        else
          job.error =
            error instanceof Error ? error.message : "Could not upload file.";
      }
      refreshJobs();
    });
  };
  const upload: Context["upload"] = (selected, target, onReady) => {
    if (!canEdit || target.taskId !== taskId) return;
    if (selected.length + jobs.current.size > 10) {
      toast.error("Upload up to 10 files at a time.");
      return;
    }
    for (const file of selected) {
      const job: Upload = {
        key: crypto.randomUUID(),
        file,
        target,
        progress: 0,
        controller: new AbortController(),
        onReady,
      };
      jobs.current.set(job.key, job);
      start(job);
    }
    refreshJobs();
  };
  return (
    <AttachmentContext.Provider
      value={{
        taskId,
        canEdit,
        enabled,
        files,
        error: loadError,
        load: refresh,
        revalidate,
        resolveUrl,
        loadMore,
        hasMore,
        upload,
        open: setPreview,
      }}
    >
      <div
        className="contents"
        onPasteCapture={(event) => {
          if (
            !enabled ||
            !canEdit ||
            (event.target as HTMLElement).closest(
              "[data-attachment-note],[data-attachment-target]",
            )
          )
            return;
          const pasted = Array.from(event.clipboardData.files);
          if (!pasted.length) return;
          event.preventDefault();
          event.stopPropagation();
          const checklistItemId =
            (event.target as HTMLElement)
              .closest("[data-task-id]")
              ?.getAttribute("data-task-id") ?? undefined;
          upload(pasted, { taskId, checklistItemId });
        }}
        onDragOverCapture={(event) => {
          if (enabled && canEdit && event.dataTransfer.types.includes("Files"))
            event.preventDefault();
        }}
        onDropCapture={(event) => {
          if (
            !enabled ||
            !canEdit ||
            (event.target as HTMLElement).closest(
              "[data-attachment-note],[data-attachment-target]",
            )
          )
            return;
          const dropped = Array.from(event.dataTransfer.files);
          if (!dropped.length) return;
          event.preventDefault();
          event.stopPropagation();
          const checklistItemId =
            (event.target as HTMLElement)
              .closest("[data-task-id]")
              ?.getAttribute("data-task-id") ?? undefined;
          upload(dropped, { taskId, checklistItemId });
        }}
      >
        {children}
      </div>
      {uploads.length > 0 && (
        <div
          className="max-h-36 shrink-0 overflow-y-auto border-t bg-background p-2 text-xs"
          aria-live="polite"
        >
          {uploads.map((job) => (
            <div key={job.key} className="flex min-w-0 items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate">
                {job.file.name}
                <span className="block text-muted-foreground">
                  {job.error ||
                    (job.progress >= 90
                      ? "Verifying file…"
                      : `${job.progress}%`)}
                </span>
              </span>
              {!job.error && (
                <progress
                  aria-label={`Upload ${job.file.name}`}
                  className="w-16"
                  value={job.progress}
                  max={100}
                />
              )}
              {job.error && (
                <button
                  className="p-2"
                  aria-label="Retry upload"
                  onClick={() => {
                    job.controller = new AbortController();
                    job.error = undefined;
                    job.progress = 0;
                    start(job);
                    refreshJobs();
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                className="p-2"
                aria-label="Cancel upload"
                onClick={() => {
                  job.controller.abort();
                  jobs.current.delete(job.key);
                  refreshJobs();
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <AttachmentPreview file={preview} close={() => setPreview(null)} />
    </AttachmentContext.Provider>
  );
}

export function useAttachmentUrl(id: string | undefined, thumbnail = false) {
  const resolveUrl = useAttachments()?.resolveUrl ?? fetchAttachmentUrl;
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [file, setFile] = useState<Attachment>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    setError(undefined);
    if (id)
      void resolveUrl(id, thumbnail)
        .then((data) => {
          if (alive) {
            setUrl(data.url);
            setFile(data.file);
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [id, thumbnail, attempt, resolveUrl]);
  return { url, file, error, retry: () => setAttempt((n) => n + 1) };
}
export function AttachmentThumbnail({ file }: { file: Attachment }) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const { url, retry } = useAttachmentUrl(
    visible && file.mime_type.startsWith("image/") ? file.id : undefined,
    true,
  );
  const retried = useRef(false);
  return (
    <div
      ref={root}
      className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded bg-muted"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? (
        <img
          alt=""
          src={url}
          loading="lazy"
          onError={() => {
            if (!retried.current) {
              retried.current = true;
              retry();
            }
          }}
          className="h-full w-full object-contain"
        />
      ) : (
        <Paperclip className="h-4 w-4" />
      )}
    </div>
  );
}
export function AttachmentList({
  target,
  onInsert,
}: {
  target: AttachmentTarget;
  onInsert?: (id: string) => void;
}) {
  const ctx = useAttachments();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string>();
  if (!ctx) return null;
  const files = ctx.files.filter((file) =>
    file.links.some((link) =>
      target.checklistItemId
        ? link.checklist_item_id === target.checklistItemId
        : target.noteId
          ? link.note_id === target.noteId
          : true,
    ),
  );
  return (
    <div
      data-attachment-target
      className="min-w-0 space-y-2"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          e.stopPropagation();
          ctx.upload(Array.from(e.dataTransfer.files), target, onInsert);
        }
      }}
      onPaste={(e) => {
        const pasted = Array.from(e.clipboardData.files);
        if (pasted.length) {
          e.preventDefault();
          e.stopPropagation();
          ctx.upload(pasted, target, onInsert);
        }
      }}
    >
      {ctx.canEdit && (
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            aria-label="Choose attachments"
            onChange={(e) => {
              ctx.upload(Array.from(e.target.files ?? []), target, onInsert);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="flex min-h-10 items-center gap-2 rounded border border-dashed px-3 text-xs"
            onClick={() => input.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
            Add files · drop or paste here
          </button>
        </>
      )}
      {files.map((file) => (
        <div
          key={file.id}
          className="flex min-w-0 items-center gap-2 rounded border p-2"
        >
          <button
            type="button"
            onClick={() => ctx.open(file)}
            aria-label={`Preview ${file.filename}`}
          >
            <AttachmentThumbnail file={file} />
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-xs"
            onClick={() => ctx.open(file)}
          >
            <span className="block truncate">{file.filename}</span>
            <span className="text-muted-foreground">
              {(file.size_bytes / 1024).toFixed(0)} KB
            </span>
          </button>
          {onInsert && (
            <button className="p-2 text-xs" onClick={() => onInsert(file.id)}>
              Insert
            </button>
          )}
          {ctx.canEdit && (
            <>
              <button
                className="p-2"
                disabled={busy === file.id}
                aria-label={`Rename ${file.filename}`}
                onClick={async () => {
                  const filename = window.prompt("File name", file.filename);
                  if (!filename) return;
                  setBusy(file.id);
                  try {
                    await attachmentRequest(`/api/attachments/${file.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ filename }),
                    });
                    await ctx.load();
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(undefined);
                  }
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {!target.noteId &&
                file.links.some((link) =>
                  target.checklistItemId
                    ? link.checklist_item_id === target.checklistItemId
                    : !link.note_id && !link.checklist_item_id,
                ) && (
                  <button
                    className="p-2"
                    disabled={busy === file.id}
                    aria-label={`Remove ${file.filename}`}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Remove this file from this location? Other placements will remain.",
                        )
                      )
                        return;
                      const link = file.links.find((l) =>
                        target.checklistItemId
                          ? l.checklist_item_id === target.checklistItemId
                          : !l.note_id && !l.checklist_item_id,
                      );
                      setBusy(file.id);
                      try {
                        await attachmentRequest(
                          `/api/attachments/${file.id}?linkId=${link!.id}`,
                          { method: "DELETE" },
                        );
                        await ctx.load();
                      } catch (e) {
                        toast.error((e as Error).message);
                      } finally {
                        setBusy(undefined);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
            </>
          )}
        </div>
      ))}
      {ctx.hasMore && (
        <button
          className="p-2 text-xs"
          onClick={() =>
            void ctx.loadMore().catch((e) => toast.error(e.message))
          }
        >
          Load more files
        </button>
      )}
      {!files.length && (
        <p className="text-xs text-muted-foreground">
          PNG, JPEG, WebP · 10 MiB. PDF · 25 MiB.
        </p>
      )}
    </div>
  );
}
function AttachmentPreview({
  file,
  close,
}: {
  file: Attachment | null;
  close: () => void;
}) {
  const mayPreview =
    file?.mime_type !== "application/pdf" || file.preview_allowed !== false;
  const { url, error, retry } = useAttachmentUrl(
    mayPreview ? file?.id : undefined,
  );
  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && close()}>
      <DialogContent
        className="z-[81] max-h-[90dvh] w-[calc(100vw-1rem)] max-w-3xl overflow-y-auto"
        overlayClassName="z-[80]"
      >
        <DialogTitle className="pr-8 text-sm break-words">
          {file?.filename}
        </DialogTitle>
        <DialogDescription>Private file preview</DialogDescription>
        {error && (
          <button className="text-sm" onClick={retry}>
            {error} · Retry
          </button>
        )}
        {!mayPreview && (
          <p className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
            This beta PDF has not been malware-scanned. In-app preview is
            disabled; only download it if you trust its source.
          </p>
        )}
        {mayPreview && !url && !error && (
          <p className="text-sm text-muted-foreground">Loading preview…</p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && file?.mime_type.startsWith("image/") && (
          <img
            src={url}
            alt={file.filename}
            className="max-h-[65dvh] w-full object-contain"
          />
        )}
        {url && file?.mime_type === "application/pdf" && (
          <iframe
            title={file.filename}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            src={url}
            className="h-[60dvh] w-full rounded border"
          />
        )}
        {url && (
          <button
            className="min-h-9 text-left text-xs text-muted-foreground"
            onClick={retry}
          >
            Refresh preview
          </button>
        )}
        <button
          className="flex min-h-10 items-center gap-2 text-sm"
          onClick={async () => {
            try {
              const data = await attachmentRequest(
                `/api/attachments/${file!.id}?download=1`,
              );
              const a = document.createElement("a");
              a.href = data.url;
              a.rel = "noopener noreferrer";
              a.target = "_blank";
              a.click();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          <Download className="h-4 w-4" />
          Download / open externally
        </button>
      </DialogContent>
    </Dialog>
  );
}
export function ActionAttachments() {
  const ctx = useAttachments();
  const [open, setOpen] = useState(false);
  if (!ctx) return null;
  if (ctx.error)
    return (
      <button
        className="min-h-10 px-4 text-left text-xs text-muted-foreground"
        onClick={() => void ctx.load().catch(() => undefined)}
      >
        Files could not load · Retry
      </button>
    );
  if (!ctx.enabled) return null;
  return (
    <div className="shrink-0 border-b px-4 py-1">
      <button
        className="flex min-h-9 items-center gap-2 text-xs text-muted-foreground"
        onClick={() => {
          setOpen(!open);
          if (!open) void ctx.revalidate().catch(() => undefined);
        }}
        aria-expanded={open}
      >
        <Paperclip className="h-3.5 w-3.5" />
        Files{" "}
        {ctx.files.length > 0
          ? `(${ctx.files.length}${ctx.hasMore ? "+" : ""})`
          : ""}
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto pb-3">
          <AttachmentList target={{ taskId: ctx.taskId }} />
        </div>
      )}
    </div>
  );
}
