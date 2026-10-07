"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Lightbulb,
  Loader2,
  Plus,
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
import { previewTextFromTipTap } from "@/lib/tiptap-parser";
import type { Note, NoteType, UpdateNoteRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY_NOTE_DOCUMENT = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const NOTE_SAVE_MS = 500;

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

function noteHeading(note: Note): string {
  const title = note.title.trim();
  if (title) return title;
  return previewTextFromTipTap(note.content, 90) || "Untitled note";
}

function notePreview(note: Note): string {
  const preview = previewTextFromTipTap(note.content, 180);
  if (!preview || preview === note.title.trim()) return "No content yet";
  return preview;
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
  canEdit: boolean;
  members?: { id: string; name: string }[];
  flushRef: MutableRefObject<(() => void) | null>;
  onTrackSave: (request: Promise<boolean>) => void;
  onCountChange?: (count: number) => void;
}

export function ActionNotes({
  taskId,
  canEdit,
  members,
  flushRef,
  onTrackSave,
  onCountChange,
}: ActionNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newType, setNewType] = useState<NoteType>("note");
  const pendingRef = useRef<{ id: string; patch: UpdateNoteRequest } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void noteApi.getByTask(taskId).then((result) => {
      if (cancelled) return;
      if (!result.success || !result.data) {
        toast.error(result.error || "Could not load notes");
        setLoading(false);
        return;
      }
      setNotes(result.data);
      onCountChange?.(result.data.length);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [onCountChange, taskId]);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedId) ?? null,
    [notes, selectedId],
  );

  const persistNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || !canEdit) return;

    setNotes((current) =>
      current.map((note) =>
        note.id === pending.id ? { ...note, ...pending.patch } : note,
      ),
    );

    const request = noteApi
      .update(pending.id, pending.patch)
      .then((result) => {
        if (!result.success || !result.data) {
          toast.error(result.error || "Could not save note");
          return false;
        }
        setNotes((current) =>
          current.map((note) =>
            note.id === pending.id
              ? { ...note, updatedAt: result.data!.updatedAt }
              : note,
          ),
        );
        return true;
      })
      .catch(() => {
        toast.error("Could not save note");
        return false;
      });
    onTrackSave(request);
  }, [canEdit, onTrackSave]);

  useEffect(() => {
    flushRef.current = persistNow;
    return () => {
      persistNow();
      if (flushRef.current === persistNow) flushRef.current = null;
    };
  }, [flushRef, persistNow]);

  const schedulePersist = useCallback(
    (id: string, patch: UpdateNoteRequest) => {
      if (!canEdit) return;
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
    [],
  );

  const createNote = async () => {
    if (!canEdit || creating) return;
    setCreating(true);
    const responsePromise = noteApi.create(taskId, {
      type: newType,
      content: EMPTY_NOTE_DOCUMENT,
    });
    onTrackSave(responsePromise.then((result) => result.success));
    const result = await responsePromise;
    setCreating(false);
    if (!result.success || !result.data) {
      toast.error(result.error || "Could not create note");
      return;
    }
    setNotes((current) => [result.data!, ...current]);
    onCountChange?.(notes.length + 1);
    setSelectedId(result.data.id);
  };

  const openNote = (id: string) => {
    persistNow();
    setSelectedId(id);
  };

  const closeNote = () => {
    persistNow();
    setSelectedId(null);
  };

  const deleteSelected = async () => {
    if (!selectedNote || !canEdit) return;
    if (pendingRef.current?.id === selectedNote.id) pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const deletedId = selectedNote.id;
    const responsePromise = noteApi.delete(deletedId);
    onTrackSave(responsePromise.then((result) => result.success));
    const result = await responsePromise;
    if (!result.success) {
      toast.error(result.error || "Could not delete note");
      return;
    }
    setNotes((current) => current.filter((note) => note.id !== deletedId));
    onCountChange?.(Math.max(0, notes.length - 1));
    setSelectedId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading notes" />
      </div>
    );
  }

  if (selectedNote) {
    const meta = NOTE_TYPE_META[selectedNote.type];
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-muted-foreground"
            onClick={closeNote}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Notes
          </Button>
          <div className="flex-1" />
          <Select
            value={selectedNote.type}
            disabled={!canEdit}
            onValueChange={(value: NoteType) => {
              patchLocalNote(selectedNote.id, { type: value });
              schedulePersist(selectedNote.id, { type: value });
            }}
          >
            <SelectTrigger className={cn("h-8 w-[132px] border-0 text-xs", meta.tone)}>
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
          {canEdit ? (
            <AlertDialog>
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
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This note will be permanently removed from the action.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void deleteSelected()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>

        <Input
          value={selectedNote.title}
          disabled={!canEdit}
          maxLength={240}
          placeholder="Note title (optional)"
          className="h-auto border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          onChange={(event) => {
            const title = event.target.value;
            patchLocalNote(selectedNote.id, { title });
            schedulePersist(selectedNote.id, { title });
          }}
        />

        <div className="rounded-xl border border-border/60 bg-muted/[0.12] px-3 py-2 md:px-4">
          <BlockEditor
            key={selectedNote.id}
            initialContent={selectedNote.content}
            hideToolbar
            placeholder="Capture a thought, learning, idea, or decision…"
            members={members}
            className={!canEdit ? "pointer-events-none opacity-60" : ""}
            onChange={(content) => {
              schedulePersist(selectedNote.id, { content });
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-2">
        <Select
          value={newType}
          disabled={!canEdit}
          onValueChange={(value: NoteType) => setNewType(value)}
        >
          <SelectTrigger className="h-8 w-[126px] border-0 bg-background/60 text-xs shadow-none">
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
        <Button
          type="button"
          size="sm"
          className="h-8 flex-1 gap-1.5"
          disabled={!canEdit || creating}
          onClick={() => void createNote()}
        >
          {creating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          New note
        </Button>
      </div>

      {notes.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-6 text-center">
          <StickyNote className="mb-3 h-8 w-8 text-muted-foreground/55" aria-hidden />
          <p className="text-sm font-medium">No notes yet</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Keep focused notes separate from the checklist and the existing Learnings document.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {notes.map((note) => {
            const meta = NOTE_TYPE_META[note.type];
            const Icon = meta.icon;
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => openNote(note.id)}
                className="group w-full rounded-xl border border-border/60 bg-background/40 p-3 text-left transition-colors hover:border-border hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <div className="flex items-start gap-3">
                  <span className={cn("mt-0.5 rounded-lg p-1.5", meta.tone)}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">{noteHeading(note)}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {noteDate(note.updatedAt)}
                      </span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                      {notePreview(note)}
                    </span>
                    <span className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground/80">
                      <span className={cn("rounded px-1.5 py-0.5 font-medium", meta.tone)}>
                        {meta.label}
                      </span>
                      <span>by {note.authorName}</span>
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
