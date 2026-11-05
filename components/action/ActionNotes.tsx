"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Lightbulb,
  Loader2,
  LayoutGrid,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { BlockEditor } from "@/components/editor/BlockEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { noteApi } from "@/lib/api";
import { notifyKnowledgeSourcesChanged } from "@/lib/knowledge-events";
import { previewTextFromTipTap } from "@/lib/tiptap-parser";
import { indexActionNotes, selectActionNotes, type ActionNoteSort, type ActionNoteTypeFilter } from "@/lib/action-note-collection";
import type { Note, NoteType, UpdateNoteRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY_NOTE_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const NOTE_SAVE_MS = 500;

interface LocalNoteDraft {
  clientId: string;
  persistedId: string | null;
  creating: boolean;
  title: string;
  type: NoteType;
  content: any;
}

interface InflightNoteSave {
  patch: UpdateNoteRequest;
  request: Promise<boolean>;
}

const NOTE_TYPE_META: Record<
  NoteType,
  { label: string; icon: typeof StickyNote; tone: string }
> = {
  note: {
    label: "Note",
    icon: StickyNote,
    tone: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  learning: {
    label: "Learning",
    icon: BookOpen,
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  idea: {
    label: "Idea",
    icon: Lightbulb,
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  decision: {
    label: "Decision",
    icon: CheckCircle2,
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
};

function hasMeaningfulDraftContent(draft: LocalNoteDraft): boolean {
  return (
    draft.title.trim().length > 0 ||
    previewTextFromTipTap(draft.content, 1).trim().length > 0
  );
}

function noteDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

interface ActionNotesProps {
  taskId: string;
  notes: Note[];
  setNotes: Dispatch<SetStateAction<Note[]>>;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  canEdit: boolean;
  members?: { id: string; name: string }[];
  flushRef: MutableRefObject<(() => void) | null>;
  onTrackSave: (request: Promise<boolean>) => void;
  /** One-shot target from an Action notification; opens after the note list loads. */
  focusedNoteId?: string | null;
  focusRevision?: number;
}

export function ActionNotes({
  taskId,
  notes,
  setNotes,
  loading,
  loadError,
  onRetry,
  canEdit,
  members,
  flushRef,
  onTrackSave,
  focusedNoteId,
  focusRevision = 0,
}: ActionNotesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LocalNoteDraft | null>(null);
  const activeDraftRef = useRef<LocalNoteDraft | null>(null);
  const draftSessionsRef = useRef(new Map<string, LocalNoteDraft>());
  const draftCounterRef = useRef(0);
  const pendingRef = useRef<{ id: string; patch: UpdateNoteRequest } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletingIdsRef = useRef(new Set<string>());
  const inflightSavesRef = useRef(new Map<string, Set<InflightNoteSave>>());
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ActionNoteTypeFilter>("all");
  const [sort, setSort] = useState<ActionNoteSort>("updated");
  const [view, setView] = useState<"compact" | "cards">("compact");
  const [visibleCount, setVisibleCount] = useState(20);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const resolvedDeepLinkRef = useRef<string | null>(null);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId],
  );
  const indexedNotes = useMemo(() => indexActionNotes(notes), [notes]);
  const matchingNotes = useMemo(
    () => selectActionNotes(indexedNotes, query, typeFilter, sort),
    [indexedNotes, query, typeFilter, sort],
  );
  const selectedPosition = matchingNotes.findIndex(({ note }) => note.id === selectedId);
  const shownNotes = matchingNotes.slice(0, Math.max(visibleCount, selectedPosition + 1));
  const hasActiveFilters = Boolean(query.trim()) || typeFilter !== "all";
  useEffect(() => { setVisibleCount(20); }, [query, typeFilter, sort]);

  useEffect(() => {
    if (!focusedNoteId || loading || loadError) return;
    const focusKey = `${focusedNoteId}:${focusRevision}`;
    if (resolvedDeepLinkRef.current === focusKey) return;
    resolvedDeepLinkRef.current = focusKey;
    if (notes.some((note) => note.id === focusedNoteId)) {
      activeDraftRef.current = null;
      setDraft(null);
      setSelectedId(focusedNoteId);
    } else {
      toast.error('This note is no longer available or you do not have access.');
    }
  }, [focusedNoteId, focusRevision, loading, loadError, notes]);

  const trackInflightSave = useCallback((id: string, save: InflightNoteSave) => {
    const saves = inflightSavesRef.current.get(id) ?? new Set<InflightNoteSave>();
    saves.add(save);
    inflightSavesRef.current.set(id, saves);
    void save.request.then(() => {
      const current = inflightSavesRef.current.get(id);
      current?.delete(save);
      if (current?.size === 0) inflightSavesRef.current.delete(id);
    });
  }, []);

  const persistNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || !canEdit || deletingIdsRef.current.has(pending.id)) return;

    setNotes((current) =>
      current.map((note) =>
        note.id === pending.id ? { ...note, ...pending.patch } : note,
      ),
    );

    const request = noteApi
      .update(pending.id, pending.patch)
      .then((result) => {
        if (!result.success || !result.data) {
          if (!deletingIdsRef.current.has(pending.id)) {
            toast.error(result.error || "Could not save note");
          }
          return false;
        }
        if (!deletingIdsRef.current.has(pending.id)) {
          setNotes((current) =>
            current.map((note) =>
              note.id === pending.id
                ? { ...note, updatedAt: result.data!.updatedAt }
                : note,
            ),
          );
          notifyKnowledgeSourcesChanged(result.data.teamId);
        }
        return true;
      })
      .catch(() => {
        if (!deletingIdsRef.current.has(pending.id)) {
          toast.error("Could not save note");
        }
        return false;
      });
    trackInflightSave(pending.id, { patch: pending.patch, request });
    onTrackSave(request);
  }, [canEdit, onTrackSave, setNotes, trackInflightSave]);

  useEffect(() => {
    flushRef.current = persistNow;
    return () => {
      persistNow();
      if (flushRef.current === persistNow) flushRef.current = null;
    };
  }, [flushRef, persistNow]);
  useEffect(
    () => () => {
      activeDraftRef.current = null;
    },
    [],
  );

  const schedulePersist = useCallback(
    (id: string, patch: UpdateNoteRequest) => {
      if (!canEdit || deletingIdsRef.current.has(id)) return;
      if (pendingRef.current && pendingRef.current.id !== id) persistNow();
      pendingRef.current = {
        id,
        patch: { ...(pendingRef.current?.patch ?? {}), ...patch },
      };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(persistNow, NOTE_SAVE_MS);
    },
    [canEdit, persistNow],
  );

  const patchLocalNote = useCallback(
    (id: string, patch: Partial<Note>) => {
      setNotes((current) =>
        current.map((note) => (note.id === id ? { ...note, ...patch } : note)),
      );
    },
    [setNotes],
  );

  const createDraftIfNeeded = useCallback(
    async (clientId: string, forAttachment = false) => {
      const current = draftSessionsRef.current.get(clientId);
      if (
        !current ||
        current.creating ||
        current.persistedId ||
        !canEdit ||
        (!forAttachment && !hasMeaningfulDraftContent(current))
      ) {
        return;
      }

      const submitted = { ...current, creating: true };
      draftSessionsRef.current.set(clientId, submitted);
      if (activeDraftRef.current?.clientId === clientId) {
        activeDraftRef.current = submitted;
        setDraft(submitted);
      }

      const responsePromise = noteApi.create(taskId, {
        title: submitted.title,
        type: submitted.type,
        content: submitted.content,
      });
      onTrackSave(responsePromise.then((result) => result.success));
      const result = await responsePromise;
      const latest = draftSessionsRef.current.get(clientId) ?? submitted;

      if (!result.success || !result.data) {
        const retryable = { ...latest, creating: false };
        if (activeDraftRef.current?.clientId === clientId) {
          draftSessionsRef.current.set(clientId, retryable);
          activeDraftRef.current = retryable;
          setDraft(retryable);
        } else {
          draftSessionsRef.current.delete(clientId);
        }
        toast.error(result.error || "Could not create note");
        return;
      }

      const created = result.data;
      notifyKnowledgeSourcesChanged(created.teamId);
      const persistedNote: Note = {
        ...created,
        title: latest.title,
        type: latest.type,
        content: latest.content,
      };
      setNotes((notesNow) => [
        persistedNote,
        ...notesNow.filter((note) => note.id !== created.id),
      ]);

      const changedDuringCreate =
        latest.title !== submitted.title ||
        latest.type !== submitted.type ||
        JSON.stringify(latest.content) !== JSON.stringify(submitted.content);
      if (changedDuringCreate) {
        schedulePersist(created.id, {
          title: latest.title,
          type: latest.type,
          content: latest.content,
        });
      }

      const persistedDraft = {
        ...latest,
        persistedId: created.id,
        creating: false,
      };
      if (activeDraftRef.current?.clientId === clientId) {
        draftSessionsRef.current.set(clientId, persistedDraft);
        activeDraftRef.current = persistedDraft;
        setDraft(persistedDraft);
      } else {
        draftSessionsRef.current.delete(clientId);
      }
    },
    [canEdit, onTrackSave, schedulePersist, setNotes, taskId],
  );

  const updateDraft = useCallback(
    (patch: Partial<Pick<LocalNoteDraft, "title" | "type" | "content">>, render = true) => {
      const current = activeDraftRef.current;
      if (!current) return;
      const next = { ...current, ...patch };
      activeDraftRef.current = next;
      draftSessionsRef.current.set(next.clientId, next);
      if (render) setDraft(next);

      if (next.persistedId) {
        schedulePersist(next.persistedId, patch);
      } else if (hasMeaningfulDraftContent(next)) {
        void createDraftIfNeeded(next.clientId);
      }
    },
    [createDraftIfNeeded, schedulePersist],
  );

  const beginDraft = () => {
    if (!canEdit) return;
    persistNow();
    draftCounterRef.current += 1;
    const next: LocalNoteDraft = {
      clientId: `new-note-${draftCounterRef.current}`,
      persistedId: null,
      creating: false,
      title: "",
      type: "note",
      content: EMPTY_NOTE_DOCUMENT,
    };
    draftSessionsRef.current.set(next.clientId, next);
    activeDraftRef.current = next;
    setSelectedId(null);
    setDraft(next);
  };

  const openNote = (id: string) => {
    persistNow();
    setDraft(null);
    activeDraftRef.current = null;
    setSelectedId(id);
  };

  const closeNote = () => {
    const currentDraft = activeDraftRef.current;
    if (currentDraft) {
      if (currentDraft.persistedId) persistNow();
      if (!currentDraft.creating) {
        draftSessionsRef.current.delete(currentDraft.clientId);
      }
      activeDraftRef.current = null;
      setDraft(null);
      return;
    }
    persistNow();
    setSelectedId(null);
  };

  const deleteSelected = async () => {
    const deleteId = draft?.persistedId ?? selectedNote?.id;
    if (!deleteId || !canEdit || deletingIdsRef.current.has(deleteId)) return;
    const deleteTeamId = notes.find((note) => note.id === deleteId)?.teamId ?? null;

    deletingIdsRef.current.add(deleteId);
    setDeletingId(deleteId);
    setDeleteError(null);
    const canceledPending =
      pendingRef.current?.id === deleteId ? pendingRef.current : null;
    if (canceledPending) pendingRef.current = null;
    if (canceledPending && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const inflightSaves = Array.from(inflightSavesRef.current.get(deleteId) ?? []);
    const inflightResults = await Promise.all(
      inflightSaves.map((save) => save.request),
    );

    const responsePromise = noteApi.delete(deleteId).catch(() => ({
      success: false as const,
      error: "Could not delete note",
    }));
    onTrackSave(responsePromise.then((result) => result.success));
    const result = await responsePromise;
    if (!result.success) {
      deletingIdsRef.current.delete(deleteId);
      setDeletingId(null);
      setDeleteError(result.error || "Could not delete note");
      const retryPatch = inflightSaves.reduce<UpdateNoteRequest | null>(
        (combined, save, index) =>
          inflightResults[index]
            ? combined
            : { ...(combined ?? {}), ...save.patch },
        canceledPending?.patch ?? null,
      );
      if (retryPatch) schedulePersist(deleteId, retryPatch);
      return;
    }

    setNotes((current) => current.filter((note) => note.id !== deleteId));
    notifyKnowledgeSourcesChanged(deleteTeamId);
    if (draft) {
      draftSessionsRef.current.delete(draft.clientId);
      activeDraftRef.current = null;
      setDraft(null);
    } else {
      setSelectedId(null);
    }
    deletingIdsRef.current.delete(deleteId);
    setDeletingId(null);
    setDeleteDialogOpen(false);
  };

  if (loading) {
    return (
      <div
        className="mx-auto flex w-full max-w-3xl animate-pulse flex-col gap-4 px-4 py-4 md:px-6"
        aria-busy="true"
        aria-label="Loading notes"
      >
        <div className="h-12 rounded-xl border border-border/40 bg-muted/10 p-2">
          <div className="h-8 w-full rounded-md bg-muted/50" />
        </div>
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-xl border border-border/40 p-3">
            <div className="flex gap-3">
              <div className="h-7 w-7 shrink-0 rounded-lg bg-muted/50" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-muted/50" />
                <div className="h-3 w-4/5 rounded bg-muted/35" />
                <div className="h-3 w-1/4 rounded bg-muted/35" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-4 md:px-6">
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-6 text-center">
          <StickyNote className="mb-3 h-8 w-8 text-muted-foreground/55" aria-hidden />
          <p className="text-sm font-medium">Could not load notes</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {loadError}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const editorNote = draft ?? selectedNote;

  const editorPanel = editorNote ? (() => {
    const meta = NOTE_TYPE_META[editorNote.type];
    const persistedId = draft?.persistedId ?? selectedNote?.id ?? null;
    const editorKey = draft?.clientId ?? selectedNote!.id;
    const isDeleting = Boolean(persistedId && deletingId === persistedId);
    return (
      <div className="flex min-w-0 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground lg:hidden"
            disabled={isDeleting}
            onClick={closeNote}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Notes
          </Button>
          <div className="flex-1" />
          <Select
            value={editorNote.type}
            disabled={!canEdit || isDeleting}
            onValueChange={(value: NoteType) => {
              if (draft) {
                updateDraft({ type: value });
              } else if (selectedNote) {
                patchLocalNote(selectedNote.id, { type: value });
                schedulePersist(selectedNote.id, { type: value });
              }
            }}
          >
            <SelectTrigger className={cn("h-9 w-[min(132px,42vw)] min-w-0 border-0 text-xs", meta.tone)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(NOTE_TYPE_META) as NoteType[]).map((type) => (
                <SelectItem key={type} value={type}>
                  {NOTE_TYPE_META[type].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && persistedId ? (
            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={(open) => {
                if (isDeleting) return;
                setDeleteDialogOpen(open);
                if (!open) setDeleteError(null);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent
                overlayClassName="z-[70]"
                className="z-[71] max-w-sm"
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This note will be permanently removed from the action.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {deleteError}
                  </p>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isDeleting}
                    onClick={(event) => {
                      event.preventDefault();
                      void deleteSelected();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Deleting…
                      </>
                    ) : (
                      "Delete"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{draft ? "New note" : "Action note"}</span>
          <span>Changes autosave</span>
        </div>
        <Input
          value={editorNote.title}
          autoFocus={Boolean(draft)}
          disabled={!canEdit || isDeleting}
          maxLength={240}
          placeholder="Note title (optional)"
          className="h-auto min-w-0 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          onChange={(event) => {
            const title = event.target.value;
            if (draft) {
              updateDraft({ title });
            } else if (selectedNote) {
              patchLocalNote(selectedNote.id, { title });
              schedulePersist(selectedNote.id, { title });
            }
          }}
        />

        <div className="min-w-0 max-w-full overflow-x-hidden rounded-2xl border border-border/60 bg-background/65 px-3 py-3 shadow-sm md:px-4">
          <BlockEditor
            key={editorKey}
            taskId={taskId}
            prepareAttachmentTarget={canEdit && !isDeleting ? async () => {
              if (persistedId) return { taskId, noteId: persistedId };
              if (!draft || draft.creating) throw new Error('Please wait for the note to finish saving.');
              await createDraftIfNeeded(draft.clientId, true);
              const id = draftSessionsRef.current.get(draft.clientId)?.persistedId;
              if (!id) throw new Error('Save the note before adding files.');
              return { taskId, noteId: id };
            } : undefined}
            initialContent={editorNote.content}
            editable={canEdit && !isDeleting}
            hideToolbar
            documentPlaceholder
            placeholder="Capture a thought, learning, idea, or decision…"
            members={members}
            className={!canEdit || isDeleting ? "opacity-60" : ""}
            onChange={(content) => {
              if (draft) {
                updateDraft({ content }, false);
              } else if (selectedNote) {
                schedulePersist(selectedNote.id, { content });
              }
            }}
          />
        </div>
      </div>

    );
  })() : null;

  return (
    <div className={cn(
      "w-full min-w-0 overflow-hidden",
      editorPanel && "lg:grid lg:grid-cols-[minmax(245px,290px)_minmax(0,1fr)] lg:divide-x lg:divide-border/50",
    )}>
      <section aria-label="Action notes navigator" className={cn(
        "min-w-0 flex-col",
        editorPanel ? "hidden lg:flex" : "flex",
      )}>
        <div className="shrink-0 border-b border-border/55 bg-muted/[0.17] px-4 pb-3 pt-4 sm:px-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold tracking-tight text-foreground">Your notes</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {hasActiveFilters
                  ? matchingNotes.length + " of " + notes.length + " notes"
                  : notes.length + (notes.length === 1 ? " note" : " notes") + " in this Action"}
              </p>
            </div>
            <Button type="button" size="sm" onClick={beginDraft} disabled={!canEdit}
              aria-label="Create note"
              className="h-9 shrink-0 gap-1.5 rounded-xl px-3 text-[12px] font-semibold shadow-sm">
              <Plus className="h-4 w-4" aria-hidden /> New note
            </Button>
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" aria-label="Search action notes" placeholder="Search titles, content, people…"
              value={query} onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full min-w-0 rounded-xl border border-border/70 bg-background/80 pl-9 pr-3 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15" />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={(value: ActionNoteTypeFilter) => setTypeFilter(value)}>
              <SelectTrigger aria-label="Filter note type" className="h-8 w-[min(140px,42vw)] min-w-0 rounded-lg border-border/60 bg-background/65 px-2.5 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(NOTE_TYPE_META) as NoteType[]).map(type => (
                  <SelectItem key={type} value={type}>{NOTE_TYPE_META[type].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value: ActionNoteSort) => setSort(value)}>
              <SelectTrigger aria-label="Sort notes" className="h-8 w-[min(135px,40vw)] min-w-0 rounded-lg border-border/60 bg-background/65 px-2.5 text-[11px]">
                <SlidersHorizontal className="mr-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Recently edited</SelectItem>
                <SelectItem value="created">Newest created</SelectItem>
                <SelectItem value="oldest">Oldest edited</SelectItem>
                <SelectItem value="title">Title A–Z</SelectItem>
              </SelectContent>
            </Select>
            {!editorPanel && (
              <div className="ml-auto inline-flex shrink-0 items-center rounded-lg border border-border/60 bg-background/70 p-0.5">
                <button type="button" aria-label="Compact note list" aria-pressed={view === "compact"}
                  title="Compact list" onClick={() => setView("compact")}
                  className={cn("flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    view === "compact" && "bg-primary/10 text-primary")}>
                  <List className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button type="button" aria-label="Note cards" aria-pressed={view === "cards"}
                  title="Cards" onClick={() => setView("cards")}
                  className={cn("flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    view === "cards" && "bg-primary/10 text-primary")}>
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
          </div>
        </div>

        {notes.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-5 py-10 text-center">
            <span className="rounded-2xl bg-primary/[0.07] p-4 text-primary"><StickyNote className="h-7 w-7" aria-hidden /></span>
            <p className="mt-2 text-[14px] font-semibold">Notes live alongside your work</p>
            <p className="max-w-xs text-[12px] leading-relaxed text-muted-foreground">
              Capture ideas, learnings and decisions. Search and organize them as your collection grows.
            </p>
            {canEdit && <Button type="button" size="sm" variant="outline" className="mt-2 gap-1.5" onClick={beginDraft}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Create your first note
            </Button>}
          </div>
        ) : matchingNotes.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center px-4 py-10 text-center">
            <Search className="h-7 w-7 text-muted-foreground/45" aria-hidden />
            <p className="mt-3 text-[13px] font-semibold">No matching notes</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Try another keyword or type.</p>
            <Button type="button" size="sm" variant="outline" className="mt-4"
              onClick={() => { setQuery(""); setTypeFilter("all"); }}>Clear filters</Button>
          </div>
        ) : (
          <div className={cn(
            "min-w-0 overscroll-contain overflow-y-auto px-3 py-3 sm:px-4",
            editorPanel ? "lg:max-h-[min(62dvh,690px)]" : "max-h-[min(58dvh,560px)]",
          )}>
            <div className={cn("grid gap-1.5",
              !editorPanel && view === "cards" ? "sm:grid-cols-2 sm:gap-3" : "grid-cols-1")}>
              {shownNotes.map(({ note, heading, preview }) => {
                const meta = NOTE_TYPE_META[note.type];
                const Icon = meta.icon;
                const active = note.id === selectedId;
                const card = !editorPanel && view === "cards";
                return (
                  <button key={note.id} type="button" onClick={() => openNote(note.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "group flex w-full min-w-0 items-start gap-2.5 rounded-xl border text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      card ? "min-h-[133px] bg-card/65 p-3.5" : "bg-transparent px-2.5 py-3",
                      active ? "border-primary/35 bg-primary/[0.065]" :
                        "border-transparent hover:border-border/60 hover:bg-muted/45",
                      !editorPanel && "border-border/35",
                    )}>
                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]", meta.tone)}>
                      <Icon className="h-[16px] w-[16px]" aria-hidden />
                    </span>
                    <span className="block min-w-0 flex-1">
                      <span className="flex min-w-0 items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold leading-5 text-foreground" title={heading}>{heading}</span>
                        <span className="shrink-0 pt-0.5 text-[10px] text-muted-foreground">{noteDate(note.updatedAt)}</span>
                      </span>
                      <span className={cn("mt-1 block min-w-0 break-words text-[11px] leading-[1.6] text-muted-foreground",
                        card ? "line-clamp-2" : "line-clamp-1")}>{preview}</span>
                      <span className="mt-2 flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground/80">
                        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 font-medium", meta.tone)}>{meta.label}</span>
                        {note.authorName && <span className="min-w-0 truncate">{note.authorName}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {shownNotes.length < matchingNotes.length && (
              <Button type="button" variant="ghost" size="sm"
                className="mt-3 h-9 w-full rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setVisibleCount(current => Math.max(current, shownNotes.length) + 20)}>
                Show more ({matchingNotes.length - shownNotes.length} remaining)
              </Button>
            )}
            <p className="mt-3 text-center text-[10px] text-muted-foreground/70" aria-live="polite">
              Showing {shownNotes.length} of {matchingNotes.length} notes
            </p>
          </div>
        )}
      </section>
      {editorPanel && (
        <section aria-label="Note editor"
          className="min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-background/35 lg:max-h-[min(68dvh,730px)]">
          {editorPanel}
        </section>
      )}
    </div>
  );
}
