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
  FileText,
  ShieldAlert,
  RotateCcw,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Image as ImageIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ATTACHMENT_ACCEPT,
  IMAGE_ATTACHMENT_ACCEPT,
  normalizeAttachmentMime,
  validateAttachmentInput,
  type Attachment,
  type AttachmentTarget,
} from "@/lib/attachments";
import { adjacentMediaIndex, formatMediaSize } from '@/lib/media-presentation';

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
  onReady?: (id: string, file: File) => void;
};
type Context = {
  taskId: string;
  canEdit: boolean;
  enabled: boolean;
  pdfUploadsEnabled: boolean;
  pdfScanningEnabled: boolean;
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
    onReady?: (id: string, file: File) => void,
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
  mimeType: string,
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
    xhr.setRequestHeader("Content-Type", mimeType);
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
  const [pdfUploadsEnabled, setPdfUploadsEnabled] = useState(false);
  const [pdfScanningEnabled, setPdfScanningEnabled] = useState(false);
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
          setPdfUploadsEnabled(body.pdfUploadsEnabled === true);
          setPdfScanningEnabled(body.pdfScanningEnabled === true);
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
        const mimeType = normalizeAttachmentMime(job.file.name, job.file.type);
        validateAttachmentInput(job.file.name, mimeType, job.file.size);
        if (mimeType === "application/pdf" && !pdfUploadsEnabled)
          throw new Error("PDF uploads are unavailable because file storage is not ready. Please retry.");
        const signed = await attachmentRequest("/api/attachments", {
          method: "POST",
          signal: job.controller.signal,
          body: JSON.stringify({
            target: job.target,
            filename: job.file.name,
            mimeType,
            size: job.file.size,
          }),
        });
        attachmentId = signed.id;
        await putFile(
          signed.uploadUrl,
          job.file,
          mimeType,
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
            job.onReady?.(signed.id,job.file);
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
      if (normalizeAttachmentMime(file.name, file.type) === "application/pdf" && !pdfUploadsEnabled) {
        toast.error("PDF uploads are unavailable because file storage is not ready. Please retry.");
        continue;
      }
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
        pdfUploadsEnabled,
        pdfScanningEnabled,
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
      <AttachmentPreview file={preview} files={files} onNavigate={setPreview} close={() => setPreview(null)} />
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
export function AttachmentThumbnail({ file, variant='compact' }: { file: Attachment;variant?:'compact'|'card' }) {
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
      className={variant==='card' ? "grid h-28 w-full shrink-0 place-items-center overflow-hidden rounded-xl bg-muted/40 sm:h-32" : "grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted/40"}
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
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <Paperclip className="h-4 w-4" />
      )}
    </div>
  );
}
/** Compact, contextual image thumbnails for a checklist row.
 * The signed preview URL is only resolved lazily by AttachmentThumbnail.
 */
export function ChecklistAttachmentRail({
  itemId,onOpen,
}:{itemId:string;onOpen:()=>void}){
  const ctx=useAttachments();
  if(!ctx)return null;
  const matched=ctx.files.filter(file=>
    file.links.some(link=>link.checklist_item_id===itemId));
  if(!matched.length)return null;
  const images=matched.filter(file=>file.mime_type.startsWith('image/'));
  return (
    <div className="checklist-item-files mt-2 flex min-w-0 max-w-full flex-wrap items-center gap-1.5" contentEditable={false}
      aria-label={`${matched.length} checklist attachments`}>
      {images.slice(0,4).map(file=>(
        <button key={file.id} type="button" onClick={()=>ctx.open(file)}
          className="group/thumbnail overflow-hidden rounded-xl border border-border/70 bg-card p-0.5 shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Preview ${file.filename}`} title={file.filename}>
          <AttachmentThumbnail file={file}/>
        </button>
      ))}
      <button type="button" onClick={onOpen}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Manage ${matched.length} checklist attachments`}>
        <Paperclip className="h-3.5 w-3.5"/>
        {images.length?matched.length>images.slice(0,4).length?`+${matched.length-images.slice(0,4).length} more`:'View files':`${matched.length} file${matched.length===1?'':'s'}`}
      </button>
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
            accept={ctx.pdfUploadsEnabled ? ATTACHMENT_ACCEPT : IMAGE_ATTACHMENT_ACCEPT}
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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="list" aria-label="Attached files">
      {files.map((file) => (
        <div
          key={file.id}
          role="listitem"
          className="group min-w-0 rounded-xl border border-border/70 bg-card p-2 shadow-sm transition-colors hover:border-primary/35"
        >
          <button
            type="button"
            onClick={() => ctx.open(file)}
            aria-label={`Preview ${file.filename}`}
            className="block w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <AttachmentThumbnail file={file} variant="card" />
          </button>
          <div className="mt-2 flex min-w-0 items-start justify-between gap-1">
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-xs"
            onClick={() => ctx.open(file)}
          >
            <span className="block truncate font-medium" title={file.filename}>{file.filename}</span>
            <span className="text-[10px] text-muted-foreground">{formatMediaSize(file.size_bytes)}</span>
          </button>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-0.5 border-t border-border/40 pt-1">
          {onInsert && (
            <button type="button" className="rounded-md bg-primary/10 px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/15"
              onClick={() => onInsert(file.id)}>
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
        </div>
      ))}
      </div>
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
          {ctx.pdfUploadsEnabled
            ? ctx.pdfScanningEnabled
              ? "PNG, JPEG, WebP · 10 MiB. PDF · 25 MiB (security-scanned)."
              : "PNG, JPEG, WebP · 10 MiB. PDF · 25 MiB (not malware-scanned; download-only)."
            : "PNG, JPEG, WebP · 10 MiB. PDF uploads unavailable while file storage is offline."}
        </p>
      )}
    </div>
  );
}
function AttachmentPreview({
  file,files,onNavigate,close,
}:{
  file:Attachment|null;
  files:Attachment[];
  onNavigate:(file:Attachment)=>void;
  close:()=>void;
}){
  const isImage=Boolean(file?.mime_type.startsWith('image/'));
  const [zoom,setZoom]=useState(1);
  const gestureX=useRef<number|null>(null);
  const imageFiles=files.filter(item=>item.mime_type.startsWith('image/'));
  const imageIds=imageFiles.map(item=>item.id);
  const imagePosition=file?imageIds.indexOf(file.id):-1;
  const canNavigate=isImage&&imagePosition>=0&&imageFiles.length>1;
  const navigate=(direction:-1|1)=>{
    if(!file)return;
    const id=adjacentMediaIndex(imageIds,file.id,direction);
    const found=imageFiles.find(item=>item.id===id);
    if(found){setZoom(1);onNavigate(found);}
  };
  useEffect(()=>{setZoom(1);},[file?.id]);
  useEffect(()=>{
    if(!file||!canNavigate)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.altKey||event.ctrlKey||event.metaKey)return;
      const active=document.activeElement;
      if(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement||active instanceof HTMLSelectElement)return;
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
        event.preventDefault();
        const direction=event.key==='ArrowLeft'?-1:1;
        const target=adjacentMediaIndex(imageIds,file.id,direction);
        const item=imageFiles.find(candidate=>candidate.id===target);
        if(item){setZoom(1);onNavigate(item);}
      }
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
    // Array contents are stable in practice but not references between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[file?.id,canNavigate,files,onNavigate]);
  const mayPreview=file?.mime_type!=='application/pdf'||file.preview_allowed!==false;
  const downloadOnlyPdf=file?.mime_type==='application/pdf'&&file.preview_allowed===false;
  const {url,error,retry}=useAttachmentUrl(mayPreview?file?.id:undefined);
  return (
    <Dialog open={Boolean(file)} onOpenChange={open=>{if(!open)close();}}>
      <DialogContent overlayClassName="z-[90]"
        className="z-[91] flex max-h-[96dvh] w-[calc(100vw-0.75rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl border border-border/70 bg-background p-0 shadow-2xl sm:w-[calc(100vw-2rem)]">
        <div className="flex min-w-0 items-center gap-3 border-b border-border/60 px-4 py-3 pr-12">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {isImage?<ImageIcon className="h-4 w-4"/>:<FileText className="h-4 w-4"/>}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-semibold" title={file?.filename}>{file?.filename}</DialogTitle>
            <DialogDescription className="mt-0.5 text-[11px]">
              {downloadOnlyPdf?'Private PDF · download only':file?`${formatMediaSize(file.size_bytes)}${file.width&&file.height?` · ${file.width} × ${file.height}`:''}`:'Private attachment'}
              {canNavigate?` · ${imagePosition+1} of ${imageFiles.length} images`:''}
            </DialogDescription>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/20"
          onTouchStart={event=>{gestureX.current=event.touches[0]?.clientX??null;}}
          onTouchEnd={event=>{
            if(!canNavigate||zoom!==1||gestureX.current===null)return;
            const diff=(event.changedTouches[0]?.clientX??gestureX.current)-gestureX.current;
            gestureX.current=null;
            if(Math.abs(diff)>55)navigate(diff>0?-1:1);
          }}>
          {error&&<button type="button" className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
            onClick={retry}><RotateCcw className="h-4 w-4"/>Preview unavailable · Retry</button>}
          {!error&&mayPreview&&!url&&
            <div className="flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
              <span className="h-8 w-8 animate-pulse rounded-xl bg-muted"/>Loading private preview…
            </div>}
          {downloadOnlyPdf&&<div className="flex flex-col items-center gap-2 p-8 text-center">
            <ShieldAlert className="h-7 w-7 text-muted-foreground"/>
            <p className="font-medium">Ready to download</p>
            <p className="max-w-sm text-xs text-muted-foreground"><span className="font-medium">Not malware-scanned</span> · Open this PDF only if you trust its source.</p>
          </div>}
          {url&&isImage&&
            <div className="flex h-[min(72dvh,740px)] w-full items-center justify-center overflow-auto p-4 sm:p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={file?.filename||'Private image'}
                className="block max-h-none rounded-lg object-contain shadow-sm"
                style={{width:zoom===1?'auto':`${Math.round(zoom*100)}%`,
                  maxWidth:zoom===1?'100%':'none',maxHeight:zoom===1?'69dvh':'none'}}/>
            </div>}
          {url&&file?.mime_type==='application/pdf'&&
            <iframe title={file.filename} sandbox="allow-scripts"
              referrerPolicy="no-referrer" src={url} className="h-[68dvh] w-full rounded border-0"/>}
          {canNavigate&&
            <>
              <button type="button" aria-label="Previous image" onClick={()=>navigate(-1)}
                className="absolute left-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border bg-background/95 shadow-md transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronLeft className="h-5 w-5"/>
              </button>
              <button type="button" aria-label="Next image" onClick={()=>navigate(1)}
                className="absolute right-2 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border bg-background/95 shadow-md transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight className="h-5 w-5"/>
              </button>
            </>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 bg-background px-4 py-3">
          {isImage&&url&&<div className="inline-flex items-center gap-1 rounded-lg border border-border/70 p-0.5">
            <button type="button" aria-label="Zoom out" disabled={zoom<=1}
              onClick={()=>setZoom(value=>Math.max(1,value-0.5))}
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
              <ZoomOut className="h-4 w-4"/>
            </button>
            <span className="min-w-12 text-center text-xs tabular-nums">{Math.round(zoom*100)}%</span>
            <button type="button" aria-label="Zoom in" disabled={zoom>=3}
              onClick={()=>setZoom(value=>Math.min(3,value+0.5))}
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
              <ZoomIn className="h-4 w-4"/>
            </button>
            <button type="button" aria-label="Reset zoom" onClick={()=>setZoom(1)}
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted">
              <Maximize2 className="h-3.5 w-3.5"/>
            </button>
          </div>}
          {canNavigate&&<span className="hidden text-[11px] text-muted-foreground sm:inline">← → to browse · Esc to close</span>}
          <div className="flex-1"/>
          <button type="button"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={async()=>{
              if(!file)return;
              try{
                const data=await attachmentRequest(`/api/attachments/${file.id}?download=1`);
                const anchor=document.createElement('a');
                anchor.href=data.url;anchor.rel='noopener noreferrer';anchor.target='_blank';
                anchor.click();
              }catch(e){toast.error((e as Error).message);}
            }}>
            <Download className="h-4 w-4"/>
            {downloadOnlyPdf?'Download PDF':'Open original / download'}
          </button>
        </div>
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
