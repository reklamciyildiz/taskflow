"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  type Transition,
  type Variants,
} from "framer-motion";
import {
  AlertCircle,
  CalendarIcon,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  ListChecks,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  StickyNote,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskUpdateFields,
  useTaskContext,
} from "@/components/TaskContext";
import {
  BlockEditor,
  type BlockEditorRef,
  type ChecklistNoteConversionRequest,
} from '@/components/editor/BlockEditor';
import {
  normalizeChecklistDocument,
  sanitizeChecklistDocument,
} from '@/components/editor/reorderChecklistItem';
import {
  countTaskItems,
  type TaskItemCounts,
} from '@/lib/tiptap-parser';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatDueDateYmdLocal, parseYmdDateInput } from "@/lib/due-date";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { format } from "date-fns";
import { DueFlowPicker } from "@/components/due/DueFlowPicker";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { ActionNotes } from "@/components/action/ActionNotes";
import { noteApi } from "@/lib/api";
import { notifyKnowledgeSourcesChanged } from "@/lib/knowledge-events";
import type { Note } from "@/lib/types";

export interface ActionPanelProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  /** Fires after the close animation completes and the panel has fully unmounted. */
  onExitComplete?: () => void;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Architecture (why three layers)
 *
 *  <ActionPanel>            always mounted; owns AnimatePresence + scroll lock.
 *    <ActionPanelSheet>     keyed presence child; backdrop + dialog chrome +
 *                           enter/exit animation. Mounted ⇄ unmounted by
 *                           AnimatePresence, never by a `return null` gate.
 *      <ActionPanelContent> keyed by task.id; ALL draft state is initialised
 *                           synchronously from the task in useState initialisers.
 *                           No hydration effect → no second commit → no editor
 *                           re-key → the first painted frame is the final layout.
 *
 * Flash root causes this removes:
 *  1. `onAnimationComplete` on an interruptible framer animation was used to
 *     decide when to unmount. framer-motion resolves an animation's promise
 *     when it is *stopped* too (MainThreadAnimation.teardown → resolveFinishedPromise),
 *     so closing before the open spring had settled fired `onExitComplete` at
 *     once and hard-unmounted a fully visible panel. AnimatePresence.onExitComplete
 *     is presence-based and immune to this.
 *  2. Draft state was hydrated in a useEffect after the first paint, then
 *     `hydratedTaskId` re-keyed the TipTap editor → a second heavy mount and a
 *     layout jump while the sheet was fading in.
 *  3. Every close unconditionally PATCHed checklist content, mutating `tasks` and
 *     re-rendering the whole app tree during the exit animation.
 *  4. Exiting (invisible) backdrop/dialog kept `pointer-events:auto`, swallowing
 *     the next click on the board.
 * ──────────────────────────────────────────────────────────────────────────── */

export function ActionPanel({
  task,
  open,
  onClose,
  onExitComplete,
}: ActionPanelProps) {
  const isNarrow = useIsNarrow();
  const present = open && task !== null;
  /** Wide layout (desktop only). Lives here so the preference survives open/close cycles. */
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  /** Registered by the mounted content; lets X / backdrop closes flush drafts synchronously. */
  const flushRef = useRef<(() => void) | null>(null);
  const requestClose = useCallback(() => {
    flushRef.current?.();
    onClose();
  }, [onClose]);

  // Prevent background scroll while the sheet is up (mobile dvh jitter / layout shift).
  useEffect(() => {
    if (!present) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [present]);

  return (
    <AnimatePresence initial={false} onExitComplete={onExitComplete}>
      {present ? (
        <ActionPanelSheet
          key="action-panel"
          isNarrow={isNarrow}
          expanded={expanded}
          onClose={requestClose}
        >
          {/* Keyed by task id: switching actions swaps content in place (with a flush on unmount). */}
          <ActionPanelContent
            key={task.id}
            task={task}
            isNarrow={isNarrow}
            expanded={expanded}
            onToggleExpanded={toggleExpanded}
            onClose={requestClose}
            flushRef={flushRef}
          />
        </ActionPanelSheet>
      ) : null}
    </AnimatePresence>
  );
}

const NARROW_MQ = "(max-width: 767px)";

function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(NARROW_MQ).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isNarrow;
}

const BACKDROP_TRANSITION: Transition = { duration: 0.2, ease: "easeOut" };
/** Exit is a short deterministic tween: predictable unmount timing, no spring "settling" tail. */
const EXIT_TRANSITION: Transition = { duration: 0.18, ease: [0.4, 0, 1, 1] };

/**
 * Force framer-motion onto its main-thread animator for these elements.
 *
 * framer-motion 11 runs `opacity` through WAAPI when it can. On finish it calls
 * `motionValue.set(final)` (rendered on the *next* frame) and then `animation.cancel()`
 * (applied *immediately*), so for exactly one frame the element falls back to the
 * inline style from its first render — `opacity: 0`. Measured at 1280px: opacity
 * 0.9998 → 0 → 1 about 300 ms after the sheet settles; that is the "transparent
 * card blinking behind the panel". Passing an `onUpdate` handler makes
 * `AcceleratedAnimation.supports()` return false, so values are written inline every
 * frame and there is nothing to revert to.
 */
const noopUpdate = () => {};

interface ActionPanelSheetProps {
  isNarrow: boolean;
  expanded: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Backdrop + dialog chrome. Lives under AnimatePresence, so `exit` runs to
 * completion before React removes the subtree.
 */
function ActionPanelSheet({
  isNarrow,
  expanded,
  onClose,
  children,
}: ActionPanelSheetProps) {
  // false while the exit animation is playing → make the (fading) layer click-through.
  const isPresent = useIsPresent();

  // Escape closes the panel. Radix layers (due-date dialog, popovers, selects)
  // handle Escape first in the capture phase and call preventDefault, so nested layers
  // close one at a time instead of tearing the whole panel down.
  useEffect(() => {
    if (!isPresent) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isPresent, onClose]);

  const sheetVariants: Variants = useMemo(
    () => ({
      closed: isNarrow
        ? { opacity: 0, y: "100%", scale: 1, transition: EXIT_TRANSITION }
        : { opacity: 0, scale: 0.96, y: 8, transition: EXIT_TRANSITION },
      open: isNarrow
        ? {
            opacity: 1,
            scale: 1,
            y: "0%",
            transition: { type: "spring", damping: 32, stiffness: 380 },
          }
        : {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: { type: "spring", damping: 28, stiffness: 320 },
          },
    }),
    [isNarrow],
  );

  return (
    <>
      <motion.div
        aria-hidden
        className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={BACKDROP_TRANSITION}
        onUpdate={noopUpdate}
        style={{ pointerEvents: isPresent ? "auto" : "none" }}
        onClick={onClose}
      />

      <div
        className={cn(
          "fixed inset-0 z-[51] flex pointer-events-none",
          "items-end justify-center md:items-center md:justify-center md:p-4 md:pb-8",
        )}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-panel-title"
          className={cn(
            "flex w-full flex-col overflow-hidden border border-border/60 bg-background shadow-2xl",
            "ring-1 ring-black/5 dark:ring-white/10",
            /*
             * Fixed height (not max-height): the panel is a workspace, so its frame must
             * not resize as the checklist grows or when switching tabs — a size change
             * re-centres the sheet and reads as a flicker.
             */
            "h-[92dvh] min-h-0 rounded-t-2xl border-b-0",
            "md:rounded-2xl md:border md:transition-[max-width,height] md:duration-200 md:ease-out",
            expanded
              ? "md:h-[min(94dvh,1100px)] md:max-w-6xl"
              : "md:h-[min(84dvh,800px)] md:max-w-3xl",
            "origin-bottom md:origin-center",
            isPresent ? "pointer-events-auto" : "pointer-events-none",
          )}
          variants={sheetVariants}
          initial="closed"
          animate="open"
          exit="closed"
          onUpdate={noopUpdate}
          style={{ willChange: "transform, opacity" }}
        >
          {children}
        </motion.div>
      </div>
    </>
  );
}

function initials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? "";
  const b =
    parts.length > 1
      ? (parts[parts.length - 1]?.[0] ?? "")
      : (parts[0]?.[1] ?? "");
  return (a + b).toUpperCase() || "?";
}

interface ActionPanelContentProps {
  task: Task;
  isNarrow: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Already flushes drafts (see `requestClose` in `ActionPanel`). */
  onClose: () => void;
  flushRef: MutableRefObject<(() => void) | null>;
}

type SaveState = "idle" | "saving" | "saved" | "error";
type WorkTab = "checklist" | "notes";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: "bg-slate-400",
  medium: "bg-sky-500",
  high: "bg-amber-500",
  urgent: "bg-rose-500",
};

/** One summary chip in the meta strip under the title. */
function MetaChip({
  icon,
  children,
  muted,
}: {
  icon?: ReactNode;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-[11rem] shrink-0 items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-1.5 text-[11px] font-medium",
        muted ? "text-muted-foreground" : "text-foreground/85",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

const META_SAVE_MS = 450;
const CHECKLIST_SAVE_MS = 500;

/** Empty editor seed; the dedicated capture row creates the first taskItem. */
function emptyChecklistDoc() {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  };
}

function checklistTextToNoteDocument(text: string) {
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    }));
  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
  };
}

function checklistTextToNoteTitle(text: string): string {
  const firstLine = text.split(/\n/)[0]?.trim() ?? "";
  return firstLine.length <= 90 ? firstLine : `${firstLine.slice(0, 87).trimEnd()}…`;
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved"
        : "Couldn’t save";
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 text-[11px] tabular-nums transition-colors",
        state === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {state === "saved" ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : state === "error" ? (
        <AlertCircle className="h-3 w-3" aria-hidden />
      ) : (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      )}
      {label}
    </span>
  );
}

/**
 * Everything inside the dialog chrome. Mounted once per task id; all draft
 * state is derived synchronously from `task` on mount (see architecture note).
 */
function ActionPanelContent({
  task,
  isNarrow,
  expanded,
  onToggleExpanded,
  onClose,
  flushRef,
}: ActionPanelContentProps) {
  const {
    updateTask,
    currentTeam,
    canEditTask,
    customers,
    boardColumns,
    customerSingularLabel,
    consumeChecklistFocusForTask,
    organizationId,
  } = useTaskContext();
  const canEdit = canEditTask(task.createdBy, task.assigneeId);
  const taskId = task.id;

  // Deep-link checklist focus is a one-shot token; consume it for this action on mount.
  useEffect(() => {
    consumeChecklistFocusForTask(taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only per task id
  }, [taskId]);

  const [canUseAdvancedReminderPresets, setCanUseAdvancedReminderPresets] =
    useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!organizationId) return;
      try {
        // Single source of truth: billing summary is backed by getOrganizationEntitlements() on the server.
        const res = await fetch(`/api/billing/summary`);
        const json = await res.json();
        const plan = String(json?.data?.plan ?? "free").toLowerCase();
        const status = String(
          json?.data?.subscriptionStatus ?? "active",
        ).toLowerCase();
        const paid =
          plan !== "free" &&
          (status === "active" ||
            status === "trialing" ||
            status === "past_due");
        if (!cancelled) setCanUseAdvancedReminderPresets(paid);
      } catch {
        // Fail closed: server-side routes also gate paid features.
        if (!cancelled) setCanUseAdvancedReminderPresets(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  // ── Draft state — initialised synchronously from `task` (no hydration effect). ──
  // The component is keyed by task.id upstream, so a different action = a fresh mount.
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [assigneeId, setAssigneeId] = useState<string>(
    task.assigneeId || "unassigned",
  );
  const [customerId, setCustomerId] = useState<string>(
    task.customerId || "none",
  );
  const [dueDate, setDueDate] = useState(() =>
    task.dueDate ? formatDueDateYmdLocal(task.dueDate) : "",
  ); // YYYY-MM-DD
  const [taskReminders, setTaskReminders] = useState<string[]>(() =>
    Array.isArray(task.reminders) ? task.reminders : [],
  );
  const [taskDueOpen, setTaskDueOpen] = useState(false);
  /** Latest checklist document; switching tabs must never remount stale content. */
  const checklistBlocksRef = useRef<any>(
    normalizeChecklistDocument(task.checklistBlocks ?? null),
  );
  const lastPersistedChecklistRef = useRef<any>(task.checklistBlocks ?? null);
  const checklistEditorRef = useRef<BlockEditorRef | null>(null);
  const checklistRevisionRef = useRef(0);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  /** Stable per mount so re-renders and tab switches never reseed a different id. */
  const emptyChecklistRef = useRef<any>(null);
  if (emptyChecklistRef.current === null) emptyChecklistRef.current = emptyChecklistDoc();
  const [checklistCounts, setChecklistCounts] = useState<TaskItemCounts>(() =>
    countTaskItems(checklistBlocksRef.current),
  );
  const [hideDone, setHideDone] = useState(false);
  // Prefetch once per mounted ActionPanelContent. This component is keyed by task.id,
  // so data from different actions can never share the same state bucket.
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesLoadError, setNotesLoadError] = useState<string | null>(null);
  const notesRequestRef = useRef(0);
  const notesFlushRef = useRef<(() => void) | null>(null);
  const loadNotes = useCallback(async () => {
    const requestId = ++notesRequestRef.current;
    setNotesLoading(true);
    setNotesLoadError(null);
    const result = await noteApi.getByTask(taskId);
    if (requestId !== notesRequestRef.current) return;
    if (!result.success || !result.data) {
      setNotesLoadError(result.error || "Please try again.");
      setNotesLoading(false);
      return;
    }
    setNotes(result.data);
    setNotesLoading(false);
  }, [taskId]);
  useEffect(() => {
    void loadNotes();
    return () => {
      notesRequestRef.current += 1;
    };
  }, [loadNotes]);
  const notesCount = notes.length;

  /** Which Action workspace is open. */
  const [tab, setTab] = useState<WorkTab>("checklist");
  /** Status / priority / assignee / due / description live behind the meta strip. */
  const [detailsOpen, setDetailsOpen] = useState(false);

  // ── Persistence core ──
  // One place owns every debounce timer + dirty flag so close/unmount/switch can
  // flush deterministically and never double-send.
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const updateTaskRef = useRef(updateTask);
  updateTaskRef.current = updateTask;

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const inflightRef = useRef(0);
  const savedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Route every autosave through here so the header can show Saving… / Saved / Couldn't save. */
  const trackSave = useCallback((request: Promise<boolean>) => {
    inflightRef.current += 1;
    if (savedResetRef.current) {
      clearTimeout(savedResetRef.current);
      savedResetRef.current = null;
    }
    setSaveState("saving");
    void request
      .then((ok) => {
        inflightRef.current -= 1;
        if (inflightRef.current > 0) return;
        setSaveState(ok ? "saved" : "error");
        if (ok) {
          savedResetRef.current = setTimeout(() => setSaveState("idle"), 2000);
        }
      })
      .catch(() => {
        inflightRef.current -= 1;
        if (inflightRef.current === 0) setSaveState("error");
      });
  }, []);
  useEffect(
    () => () => {
      if (savedResetRef.current) clearTimeout(savedResetRef.current);
    },
    [],
  );

  const pendingMetaRef = useRef<TaskUpdateFields | null>(null);
  const metaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checklistDirtyRef = useRef(false);
  const checklistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checklistSaveInFlightRef = useRef(false);
  const persistChecklistNowRef = useRef<() => void>(() => undefined);

  const persistMetaNow = useCallback(() => {
    if (metaTimerRef.current) {
      clearTimeout(metaTimerRef.current);
      metaTimerRef.current = null;
    }
    const patch = pendingMetaRef.current;
    pendingMetaRef.current = null;
    if (!patch || !canEditRef.current) return;
    trackSave(updateTaskRef.current(taskId, patch));
  }, [taskId, trackSave]);

  const persistChecklistNow = useCallback(() => {
    if (checklistTimerRef.current) {
      clearTimeout(checklistTimerRef.current);
      checklistTimerRef.current = null;
    }
    if (!checklistDirtyRef.current || !canEditRef.current) return;
    if (checklistSaveInFlightRef.current) return;
    checklistDirtyRef.current = false;
    checklistSaveInFlightRef.current = true;
    const data = sanitizeChecklistDocument(checklistBlocksRef.current);
    if (data === null || data === undefined) {
      checklistSaveInFlightRef.current = false;
      return;
    }
    const revision = checklistRevisionRef.current;
    const rollback = lastPersistedChecklistRef.current;
    const request = updateTaskRef.current(taskId, { checklistBlocks: data });
    trackSave(request);
    void request.then((ok) => {
      checklistSaveInFlightRef.current = false;
      if (ok) {
        lastPersistedChecklistRef.current = data;
      } else if (
        revision === checklistRevisionRef.current &&
        !checklistDirtyRef.current
      ) {
        // No newer edit can supersede this failed snapshot: restore the last
        // server-confirmed document so UI and database cannot silently diverge.
        checklistBlocksRef.current = rollback;
        checklistEditorRef.current?.replaceContent(
          rollback ?? emptyChecklistRef.current,
        );
        const next = countTaskItems(rollback);
        setChecklistCounts(next);
        toast.error("Checklist couldn't be saved. Your latest change was restored.");
      } else if (!ok) {
        toast.error("Checklist couldn't be saved yet. Retrying your latest changes.");
      }

      if (checklistDirtyRef.current) {
        window.setTimeout(() => persistChecklistNowRef.current(), 0);
      }
    });
  }, [taskId, trackSave]);
  persistChecklistNowRef.current = persistChecklistNow;

  /** Flush every pending draft immediately (close, action switch, unmount). Idempotent. */
  const flushAll = useCallback(() => {
    persistMetaNow();
    persistChecklistNow();
    notesFlushRef.current?.();
  }, [persistMetaNow, persistChecklistNow]);

  /** Patches are merged, so editing title then description within the debounce window keeps both. */
  const scheduleMetaPersist = useCallback(
    (patch: TaskUpdateFields) => {
      if (!canEditRef.current) return;
      pendingMetaRef.current = { ...(pendingMetaRef.current ?? {}), ...patch };
      if (metaTimerRef.current) clearTimeout(metaTimerRef.current);
      metaTimerRef.current = setTimeout(persistMetaNow, META_SAVE_MS);
    },
    [persistMetaNow],
  );

  const scheduleChecklistPersist = useCallback(
    (data: any) => {
      checklistBlocksRef.current = data;
      checklistRevisionRef.current += 1;
      // Progress header: only re-render when the numbers actually change.
      const next = countTaskItems(data);
      setChecklistCounts((prev) =>
        prev.total === next.total && prev.done === next.done ? prev : next,
      );
      if (!canEditRef.current) return;
      checklistDirtyRef.current = true;
      if (checklistTimerRef.current) clearTimeout(checklistTimerRef.current);
      checklistTimerRef.current = setTimeout(persistChecklistNow, CHECKLIST_SAVE_MS);
    },
    [persistChecklistNow],
  );

  const convertChecklistItemToNote = useCallback(
    async (request: ChecklistNoteConversionRequest): Promise<boolean> => {
      const text = request.text.trim();
      if (!text || !canEditRef.current) return false;

      const createRequest = noteApi.create(taskId, {
        title: checklistTextToNoteTitle(text),
        type: request.type,
        content: checklistTextToNoteDocument(text),
      });
      trackSave(createRequest.then((result) => result.success));
      const result = await createRequest;
      if (!result.success || !result.data) {
        toast.error(result.error || "The note couldn't be created.");
        return false;
      }

      setNotes((current) => {
        if (current.some((note) => note.id === result.data!.id)) return current;
        return [result.data!, ...current];
      });
      notifyKnowledgeSourcesChanged(result.data.teamId);

      if (request.removeAfter) {
        const removed = checklistEditorRef.current?.removeTaskItem(
          request.taskItemId,
        );
        if (!removed) {
          toast.success("Note created. The checklist item was kept.");
          return true;
        }
      }

      toast.success(request.removeAfter ? "Converted to Note" : "Note created");
      return true;
    },
    [taskId, trackSave],
  );

  // Unmount (exit finished, action switched, or task vanished): flush whatever is still pending.
  // `flushAll` only depends on `taskId`, which is fixed for this mount, so this runs exactly once.
  useEffect(() => () => flushAll(), [flushAll]);

  // Expose the flush to the shell so X / backdrop closes persist synchronously,
  // before the exit animation starts, rather than relying on unmount timing.
  useEffect(() => {
    flushRef.current = flushAll;
    return () => {
      if (flushRef.current === flushAll) flushRef.current = null;
    };
  }, [flushAll, flushRef]);

  const statusSelectOptions = useMemo(() => {
    const base = boardColumns;
    if (status && !base.some((c) => c.id === status)) {
      return [{ id: status, title: status }, ...base];
    }
    return base;
  }, [boardColumns, status]);

  const selectedDueDate = dueDate ? parseYmdDateInput(dueDate) : undefined;

  /** Leaving a tab unmounts its editor; persist right away instead of waiting for the debounce. */
  const switchTab = useCallback(
    (next: string) => {
      if (next !== "checklist" && next !== "notes") return;
      if (next === tab) return;
      if (tab === "notes") {
        notesFlushRef.current?.();
      } else {
        persistChecklistNow();
      }
      setTab(next);
    },
    [persistChecklistNow, tab],
  );

  const checklistProgress =
    checklistCounts.total > 0
      ? Math.round((checklistCounts.done / checklistCounts.total) * 100)
      : 0;
  const allDone =
    checklistCounts.total > 0 && checklistCounts.done === checklistCounts.total;

  const statusLabel =
    statusSelectOptions.find((c) => c.id === status)?.title ?? status;
  const assigneeName =
    assigneeId === "unassigned"
      ? null
      : (currentTeam?.members.find((m) => m.id === assigneeId)?.name ?? null);
  const customerName =
    customerId === "none"
      ? null
      : (customers.find((c) => c.id === customerId)?.name ?? null);

  return (
    <>
      {/* ── Header: title, save state, window controls, meta strip, (details) ── */}
      <div
        className={cn(
          "shrink-0 border-b border-border/50 bg-muted/10 md:rounded-t-2xl",
          // Details can be tall; cap the header so the work area always keeps room.
          detailsOpen && "max-h-[70%] overflow-y-auto overscroll-contain",
        )}
      >
        <div className="flex items-start gap-2 px-4 pt-3 md:px-6 md:pt-4">
          <label htmlFor="action-panel-title" className="sr-only">
            Title
          </label>
          <Input
            id="action-panel-title"
            value={title}
            disabled={!canEdit}
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
              scheduleMetaPersist({ title: v });
            }}
            placeholder="Untitled action"
            className="h-9 min-w-0 flex-1 border-0 bg-transparent px-0 text-lg font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 md:text-xl disabled:opacity-100"
          />
          <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
            <span className="mr-1.5 hidden sm:inline-flex">
              <SaveStatus state={saveState} />
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden h-8 w-8 text-muted-foreground md:inline-flex"
              aria-label={expanded ? "Shrink panel" : "Expand panel"}
              aria-pressed={expanded}
              onClick={onToggleExpanded}
            >
              {expanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-label="Toggle action details"
              className={cn(
                "group flex w-full items-center gap-1.5 px-4 pb-2.5 pt-2 text-left md:px-6",
                "focus-visible:outline-none",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <MetaChip>{statusLabel}</MetaChip>
                <MetaChip
                  icon={
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        PRIORITY_DOT[priority] ?? "bg-slate-400",
                      )}
                      aria-hidden
                    />
                  }
                >
                  {PRIORITY_LABEL[priority] ?? priority}
                </MetaChip>
                <MetaChip
                  muted={!assigneeName}
                  icon={<UserRound className="h-3 w-3" aria-hidden />}
                >
                  {assigneeName ?? "Unassigned"}
                </MetaChip>
                <MetaChip
                  muted={!selectedDueDate}
                  icon={<CalendarIcon className="h-3 w-3" aria-hidden />}
                >
                  {selectedDueDate
                    ? format(selectedDueDate, "MMM d")
                    : "No due date"}
                </MetaChip>
                {customerName ? <MetaChip>{customerName}</MetaChip> : null}
                {!canEdit ? <MetaChip muted>Read-only</MetaChip> : null}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors group-hover:bg-muted/40 group-hover:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring/30">
                Details
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    detailsOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden">
                    <div className="space-y-5 px-4 pb-4 md:px-6">
                      <div className="rounded-xl border border-border/50 bg-background/60 p-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase text-muted-foreground">
                              Status
                            </Label>
                            <Select
                              value={status}
                              onValueChange={(v) => {
                                setStatus(v as TaskStatus);
                                if (task && canEdit)
                                  void updateTask(task.id, {
                                    status: v as TaskStatus,
                                  });
                              }}
                              disabled={!canEdit}
                            >
                              <SelectTrigger className="h-9 border-border/60 bg-background/80">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {statusSelectOptions.map((col) => (
                                  <SelectItem key={col.id} value={col.id}>
                                    {col.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase text-muted-foreground">
                              Priority
                            </Label>
                            <Select
                              value={priority}
                              onValueChange={(v) => {
                                setPriority(v as TaskPriority);
                                if (task && canEdit)
                                  void updateTask(task.id, {
                                    priority: v as TaskPriority,
                                  });
                              }}
                              disabled={!canEdit}
                            >
                              <SelectTrigger className="h-9 border-border/60 bg-background/80">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="urgent">Urgent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase text-muted-foreground">
                              Assignee
                            </Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={!canEdit}
                                  className={cn(
                                    "h-9 w-full justify-between border-border/60 bg-background/80 text-left font-normal",
                                    assigneeId === "unassigned" &&
                                      "text-muted-foreground",
                                  )}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    {assigneeId === "unassigned" ? (
                                      <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground/70">
                                        <UserRound
                                          className="h-3.5 w-3.5"
                                          aria-hidden
                                        />
                                      </span>
                                    ) : (
                                      <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                                        {initials(
                                          currentTeam?.members.find(
                                            (m) => m.id === assigneeId,
                                          )?.name ?? "",
                                        )}
                                      </span>
                                    )}
                                    <span className="truncate">
                                      {assigneeId === "unassigned"
                                        ? "Unassigned"
                                        : (currentTeam?.members.find(
                                            (m) => m.id === assigneeId,
                                          )?.name ?? "Assignee")}
                                    </span>
                                  </span>
                                  <ChevronDown
                                    className="h-4 w-4 opacity-60"
                                    aria-hidden
                                  />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-72 p-0"
                                align="start"
                                onOpenAutoFocus={(e) => e.preventDefault()}
                              >
                                <div className="border-b border-border/60 px-3 py-2">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Assignee
                                  </p>
                                </div>
                                <Command className="rounded-none">
                                  <CommandInput placeholder="Search member…" />
                                  <CommandList>
                                    <CommandEmpty>No results.</CommandEmpty>
                                    <CommandGroup heading=" ">
                                      <CommandItem
                                        className="flex items-center gap-2"
                                        onSelect={() => {
                                          setAssigneeId("unassigned");
                                          if (task && canEdit)
                                            void updateTask(task.id, {
                                              assigneeId: null,
                                            });
                                        }}
                                      >
                                        <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground/70">
                                          <UserRound
                                            className="h-3.5 w-3.5"
                                            aria-hidden
                                          />
                                        </span>
                                        <span className="flex-1 truncate text-sm">
                                          Unassigned
                                        </span>
                                        {assigneeId === "unassigned" && (
                                          <Check
                                            className="h-4 w-4 text-primary"
                                            aria-hidden
                                          />
                                        )}
                                      </CommandItem>
                                    </CommandGroup>
                                    <CommandGroup heading=" ">
                                      {(currentTeam?.members ?? []).map(
                                        (member) => (
                                          <CommandItem
                                            key={member.id}
                                            className="flex items-center gap-2"
                                            onSelect={() => {
                                              setAssigneeId(member.id);
                                              if (task && canEdit) {
                                                void updateTask(task.id, {
                                                  assigneeId: member.id,
                                                });
                                              }
                                            }}
                                          >
                                            <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground/80">
                                              {initials(member.name)}
                                            </span>
                                            <span className="flex-1 truncate">
                                              {member.name}
                                            </span>
                                            {assigneeId === member.id && (
                                              <Check
                                                className="h-4 w-4 text-primary"
                                                aria-hidden
                                              />
                                            )}
                                          </CommandItem>
                                        ),
                                      )}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] uppercase text-muted-foreground">
                              Due date
                            </Label>
                            {isNarrow ? (
                              <Drawer
                                open={taskDueOpen}
                                onOpenChange={setTaskDueOpen}
                              >
                                <DrawerTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!canEdit}
                                    className={cn(
                                      "h-9 w-full justify-start border-border/60 bg-background/80 text-left font-normal",
                                      !selectedDueDate &&
                                        "text-muted-foreground",
                                    )}
                                    onClick={() => setTaskDueOpen(true)}
                                  >
                                    <CalendarIcon
                                      className="mr-2 h-4 w-4"
                                      aria-hidden
                                    />
                                    {selectedDueDate
                                      ? format(selectedDueDate, "PPP")
                                      : "Select date"}
                                  </Button>
                                </DrawerTrigger>
                                <DrawerContent className="p-0">
                                  <div className="px-2 pb-3 pt-2">
                                    <DueFlowPicker
                                      value={task.dueDate ?? null}
                                      reminders={taskReminders}
                                      canUseAdvancedReminderPresets={
                                        canUseAdvancedReminderPresets
                                      }
                                      disabled={!canEdit}
                                      onChange={(next) => {
                                        if (!task || !canEdit) return;
                                        setDueDate(
                                          next
                                            ? formatDueDateYmdLocal(next)
                                            : "",
                                        );
                                        void updateTask(task.id, {
                                          dueDate: next,
                                          reminders: taskReminders,
                                        });
                                      }}
                                      onRemindersChange={(next) => {
                                        if (!task || !canEdit) return;
                                        const arr = Array.isArray(next)
                                          ? next
                                          : [];
                                        setTaskReminders(arr);
                                        void updateTask(task.id, {
                                          reminders: arr,
                                        });
                                      }}
                                      onRequestClose={() =>
                                        setTaskDueOpen(false)
                                      }
                                    />
                                  </div>
                                </DrawerContent>
                              </Drawer>
                            ) : (
                              <Dialog
                                open={taskDueOpen}
                                onOpenChange={setTaskDueOpen}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={!canEdit}
                                    className={cn(
                                      "h-9 w-full justify-start border-border/60 bg-background/80 text-left font-normal",
                                      !selectedDueDate &&
                                        "text-muted-foreground",
                                    )}
                                  >
                                    <CalendarIcon
                                      className="mr-2 h-4 w-4"
                                      aria-hidden
                                    />
                                    {selectedDueDate
                                      ? format(selectedDueDate, "PPP")
                                      : "Select date"}
                                  </Button>
                                </DialogTrigger>
                                <DialogContent
                                  hideClose
                                  className="flex max-h-[92dvh] min-h-0 w-[min(92vw,380px)] max-w-[min(92vw,380px)] flex-col gap-0 overflow-hidden p-0"
                                >
                                  <DueFlowPicker
                                    value={task.dueDate ?? null}
                                    reminders={taskReminders}
                                    canUseAdvancedReminderPresets={
                                      canUseAdvancedReminderPresets
                                    }
                                    disabled={!canEdit}
                                    onChange={(next) => {
                                      if (!task || !canEdit) return;
                                      setDueDate(
                                        next ? formatDueDateYmdLocal(next) : "",
                                      );
                                      void updateTask(task.id, {
                                        dueDate: next,
                                        reminders: taskReminders,
                                      });
                                    }}
                                    onRemindersChange={(next) => {
                                      if (!task || !canEdit) return;
                                      const arr = Array.isArray(next)
                                        ? next
                                        : [];
                                      setTaskReminders(arr);
                                      void updateTask(task.id, {
                                        reminders: arr,
                                      });
                                    }}
                                    onRequestClose={() => setTaskDueOpen(false)}
                                  />
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-[11px] uppercase text-muted-foreground">
                              {customerSingularLabel}
                            </Label>
                            <Select
                              value={customerId}
                              onValueChange={(v) => {
                                setCustomerId(v);
                                if (task && canEdit) {
                                  void updateTask(task.id, {
                                    customerId: v === "none" ? null : v,
                                  });
                                }
                              }}
                              disabled={!canEdit}
                            >
                              <SelectTrigger className="h-9 border-border/60 bg-background/80">
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  No {customerSingularLabel}
                                </SelectItem>
                                {customers.map((customer) => (
                                  <SelectItem
                                    key={customer.id}
                                    value={customer.id}
                                  >
                                    {customer.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] uppercase text-muted-foreground">
                          Description
                        </Label>
                        <textarea
                          value={description}
                          disabled={!canEdit}
                          enterKeyHint="enter"
                          onChange={(e) => {
                            const v = e.target.value;
                            setDescription(v);
                            scheduleMetaPersist({ description: v });
                          }}
                          placeholder="Short context…"
                          rows={2}
                          className="w-full resize-none rounded-lg border border-border/50 bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none ring-offset-background placeholder:text-muted-foreground/45 focus-visible:ring-2 focus-visible:ring-ring/30"
                        />
                      </div>
                    </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── Work area: one document at a time, full remaining height ── */}
      <Tabs
        value={tab}
        onValueChange={switchTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-2 md:px-4">
          <TabsList className="h-auto justify-start gap-0 rounded-none bg-transparent p-0">
            <TabsTrigger
              value="checklist"
              className={cn(
                "relative h-11 gap-1.5 rounded-none px-2 text-sm font-medium text-muted-foreground shadow-none md:gap-2 md:px-3",
                "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent",
                "data-[state=active]:after:bg-primary",
              )}
            >
              <ListChecks className="h-4 w-4" aria-hidden />
              Checklist
              {checklistCounts.total > 0 ? (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-px text-[11px] tabular-nums",
                    allDone
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted/70 text-muted-foreground",
                  )}
                  aria-label={`${checklistCounts.done} of ${checklistCounts.total} done`}
                >
                  {checklistCounts.done}/{checklistCounts.total}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className={cn(
                "relative h-11 gap-1.5 rounded-none px-2 text-sm font-medium text-muted-foreground shadow-none md:gap-2 md:px-3",
                "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent",
                "data-[state=active]:after:bg-primary",
              )}
            >
              <StickyNote className="h-4 w-4" aria-hidden />
              Notes
              {notesCount > 0 ? (
                <span className="hidden rounded-md bg-muted/70 px-1.5 py-px text-[11px] tabular-nums text-muted-foreground sm:inline">
                  {notesCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {tab === "checklist" && checklistCounts.done > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
              aria-label={hideDone ? `Show done (${checklistCounts.done})` : `Hide done (${checklistCounts.done})`}
              aria-pressed={hideDone}
              onClick={() => setHideDone((v) => !v)}
            >
              {hideDone ? (
                <Eye className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {hideDone
                  ? `Show done (${checklistCounts.done})`
                  : `Hide done (${checklistCounts.done})`}
              </span>
            </Button>
          ) : null}
        </div>

        {/* Progress rail: sits on the tab divider so it reads as part of the chrome, not content. */}
        <div className="h-0.5 w-full shrink-0 bg-transparent" aria-hidden={tab !== "checklist"}>
          {tab === "checklist" && checklistCounts.total > 0 ? (
            <div
              className="h-full w-full bg-muted/40"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={checklistProgress}
              aria-label="Checklist progress"
            >
              <div
                className={cn(
                  "h-full transition-[width] duration-300 ease-out",
                  allDone ? "bg-emerald-500" : "bg-primary",
                )}
                style={{ width: `${checklistProgress}%` }}
              />
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <TabsContent
            value="checklist"
            className={cn(
              "mt-0 px-4 py-4 outline-none md:px-6",
              hideDone &&
                "[&_[data-type=taskItem][data-checked=true]:not([data-completion-pending=true])]:hidden",
            )}
          >
            {canEdit ? (
              <form
                className="mb-3 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-2.5 transition-colors focus-within:border-primary/50 focus-within:bg-background/70 focus-within:ring-2 focus-within:ring-primary/10"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = newChecklistItem.trim();
                  if (!value) {
                    setNewChecklistItem("");
                    return;
                  }
                  if (!checklistEditorRef.current?.appendTaskItem(value)) return;
                  setNewChecklistItem("");
                }}
              >
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <Input
                  value={newChecklistItem}
                  onChange={(event) => setNewChecklistItem(event.target.value)}
                  placeholder="Add checklist item..."
                  aria-label="Add checklist item"
                  className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <span className="hidden shrink-0 text-[10px] text-muted-foreground/70 sm:inline">
                  Enter
                </span>
              </form>
            ) : null}
            <BlockEditor
              ref={checklistEditorRef}
              initialContent={checklistBlocksRef.current}
              emptyContent={emptyChecklistRef.current}
              hideToolbar
              checklistMode
              hideDone={hideDone}
              canUseAdvancedReminderPresets={canUseAdvancedReminderPresets}
              onChange={scheduleChecklistPersist}
              onConvertTaskItemToNote={convertChecklistItemToNote}
              placeholder=""
              members={currentTeam?.members}
              className={cn(
                "checklist-editor",
                !hideDone && "checklist-show-completed",
                checklistCounts.total === 0 &&
                  "pointer-events-none h-0 overflow-hidden opacity-0",
                !canEdit && "pointer-events-none opacity-60",
              )}
            />
            {hideDone && allDone ? (
              <p className="px-1 pt-2 text-xs text-muted-foreground">
                Everything is done — all {checklistCounts.total} items are hidden.
              </p>
            ) : null}
          </TabsContent>

          <TabsContent value="notes" className="mt-0 outline-none">
            <ActionNotes
              taskId={taskId}
              notes={notes}
              setNotes={setNotes}
              loading={notesLoading}
              loadError={notesLoadError}
              onRetry={() => void loadNotes()}
              canEdit={canEdit}
              members={currentTeam?.members}
              flushRef={notesFlushRef}
              onTrackSave={trackSave}
            />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
