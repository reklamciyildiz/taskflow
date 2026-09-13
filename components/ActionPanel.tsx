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
  Loader2,
  UserRound,
  X,
  Lightbulb,
  Maximize2,
  Minimize2,
  NotebookPen,
} from "lucide-react";
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
import { BlockEditor, type BlockEditorRef } from '@/components/editor/BlockEditor';
import {
  countTaskItems,
  migrateLegacyJournalToTipTap,
  migrateLegacyLearningsToTipTap,
  previewTextFromTipTap,
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
 *     `hydratedTaskId` re-keyed both TipTap editors → two heavy mounts and a
 *     layout jump while the sheet was fading in.
 *  3. Every close unconditionally PATCHed `journalLogs`, mutating `tasks` and
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
          onClose={requestClose}
        >
          {/* Keyed by task id: switching actions swaps content in place (with a flush on unmount). */}
          <ActionPanelContent
            key={task.id}
            task={task}
            isNarrow={isNarrow}
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

interface ActionPanelSheetProps {
  isNarrow: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Backdrop + dialog chrome. Lives under AnimatePresence, so `exit` runs to
 * completion before React removes the subtree.
 */
function ActionPanelSheet({ isNarrow, onClose, children }: ActionPanelSheetProps) {
  // false while the exit animation is playing → make the (fading) layer click-through.
  const isPresent = useIsPresent();

  // Escape closes the panel. Radix layers (Zen dialog, due-date dialog, popovers, selects)
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
            "flex w-full max-w-3xl flex-col overflow-hidden border border-border/60 bg-background shadow-2xl",
            "ring-1 ring-black/5 dark:ring-white/10",
            /* max-height + min-h-0: allow the flex child to shrink for scrollable content */
            "max-h-[min(92dvh,920px)] min-h-0",
            "rounded-t-2xl border-b-0 md:rounded-2xl md:border md:max-h-[min(88dvh,900px)]",
            "origin-bottom md:origin-center",
            isPresent ? "pointer-events-auto" : "pointer-events-none",
          )}
          variants={sheetVariants}
          initial="closed"
          animate="open"
          exit="closed"
          style={{ willChange: "transform, opacity" }}
        >
          {children}
        </motion.div>
      </div>
    </>
  );
}

/** TipTap document for the checklist editor; migrates legacy `journal_logs` rows on the fly. */
function resolveChecklistBlocks(task: Task): unknown | null {
  if (task.checklistBlocks) return task.checklistBlocks;
  return migrateLegacyJournalToTipTap(task.journalLogs ?? []) ?? null;
}

/** TipTap document for the learnings editor; migrates the legacy free-text `learnings` column. */
function resolveLearningsBlocks(task: Task): unknown | null {
  if (task.learningsBlocks) return task.learningsBlocks;
  const legacy = (task.learnings ?? "").trim();
  return legacy ? migrateLegacyLearningsToTipTap(legacy) : null;
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
  /** Already flushes drafts (see `requestClose` in `ActionPanel`). */
  onClose: () => void;
  flushRef: MutableRefObject<(() => void) | null>;
}

type BlocksField = "checklistBlocks" | "learningsBlocks";
type SaveState = "idle" | "saving" | "saved" | "error";

const META_SAVE_MS = 450;
const BLOCKS_SAVE_MS = 500;

/** A brand-new checklist starts as a task list, not a plain paragraph the user has to convert. */
const EMPTY_CHECKLIST_DOC = {
  type: "doc",
  content: [
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph" }],
        },
      ],
    },
  ],
};

/** Learnings prompts insert real structure (heading + bullet) instead of literal "## …" text. */
const LEARNING_PROMPTS: { label: string; heading: string }[] = [
  { label: "Key takeaways", heading: "Key takeaways" },
  { label: "What worked", heading: "What worked" },
  { label: "What didn’t", heading: "What didn’t" },
  { label: "Next time", heading: "Next time" },
  { label: "Decision", heading: "Decision / rationale" },
];

function learningPromptNodes(heading: string) {
  return [
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: heading }],
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
    },
  ];
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
  /**
   * TipTap documents. The refs are the single source of truth for the *latest* content;
   * every editor instance (panel or Zen) mounts from the ref, so switching between them
   * never shows stale text or lets one instance overwrite the other's edits.
   */
  const checklistBlocksRef = useRef<any>(resolveChecklistBlocks(task));
  const learningsBlocksRef = useRef<any>(resolveLearningsBlocks(task));
  const [checklistCounts, setChecklistCounts] = useState<TaskItemCounts>(() =>
    countTaskItems(checklistBlocksRef.current),
  );
  const [hideDone, setHideDone] = useState(false);
  /** Collapsed-state one-liner. Refreshed when the Learnings section collapses, not per keystroke. */
  const [learningsPreview, setLearningsPreview] = useState(() =>
    previewTextFromTipTap(learningsBlocksRef.current) ||
    (task.learnings ?? "").replace(/\s+/g, " ").trim().slice(0, 140),
  );

  const [learningsOpen, setLearningsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState<
    "none" | "checklist" | "learnings"
  >("none");
  const [zenOpen, setZenOpen] = useState(false);
  const [zenTab, setZenTab] = useState<"checklist" | "learnings">("checklist");
  /** Title, status, description, etc. — default collapsed for a note-first flow */
  const [detailsOpen, setDetailsOpen] = useState(false);

  const learningsEditorRef = useRef<BlockEditorRef | null>(null);

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
  const dirtyBlocksRef = useRef<Record<BlocksField, boolean>>({
    checklistBlocks: false,
    learningsBlocks: false,
  });
  const blocksTimerRef = useRef<
    Record<BlocksField, ReturnType<typeof setTimeout> | null>
  >({ checklistBlocks: null, learningsBlocks: null });

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

  const persistBlocksNow = useCallback(
    (field: BlocksField) => {
      const timer = blocksTimerRef.current[field];
      if (timer) {
        clearTimeout(timer);
        blocksTimerRef.current[field] = null;
      }
      if (!dirtyBlocksRef.current[field] || !canEditRef.current) return;
      dirtyBlocksRef.current[field] = false;
      const data =
        field === "checklistBlocks"
          ? checklistBlocksRef.current
          : learningsBlocksRef.current;
      if (data === null || data === undefined) return;
      trackSave(updateTaskRef.current(taskId, { [field]: data }));
    },
    [taskId, trackSave],
  );

  /** Flush every pending draft immediately (close, action switch, unmount). Idempotent. */
  const flushAll = useCallback(() => {
    persistMetaNow();
    persistBlocksNow("checklistBlocks");
    persistBlocksNow("learningsBlocks");
  }, [persistMetaNow, persistBlocksNow]);

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

  const scheduleBlocksPersist = useCallback(
    (field: BlocksField, data: any) => {
      if (field === "checklistBlocks") {
        checklistBlocksRef.current = data;
        // Progress header: only re-render when the numbers actually change.
        const next = countTaskItems(data);
        setChecklistCounts((prev) =>
          prev.total === next.total && prev.done === next.done ? prev : next,
        );
      } else {
        learningsBlocksRef.current = data;
      }
      if (!canEditRef.current) return;
      dirtyBlocksRef.current[field] = true;
      const prev = blocksTimerRef.current[field];
      if (prev) clearTimeout(prev);
      blocksTimerRef.current[field] = setTimeout(
        () => persistBlocksNow(field),
        BLOCKS_SAVE_MS,
      );
    },
    [persistBlocksNow],
  );

  /** Learnings-specific immediate flush (collapse, focus change, Zen close/tab switch). */
  const flushLearningsNow = useCallback(() => {
    persistBlocksNow("learningsBlocks");
  }, [persistBlocksNow]);

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

  /** Collapse Learnings: refresh the preview line from the latest document and persist. */
  const collapseLearnings = useCallback(() => {
    setLearningsPreview(previewTextFromTipTap(learningsBlocksRef.current));
    setLearningsOpen(false);
    flushLearningsNow();
  }, [flushLearningsNow]);

  const appendLearningTemplate = useCallback(
    (heading: string) => {
      if (!canEdit) return;
      setLearningsOpen(true);
      const insert = () =>
        learningsEditorRef.current?.insertContent(learningPromptNodes(heading));
      // If the section was collapsed the editor mounts on this render; insert once it exists.
      if (learningsEditorRef.current) insert();
      else requestAnimationFrame(insert);
    },
    [canEdit],
  );

  const setFocusModeSafe = useCallback(
    (next: "none" | "checklist" | "learnings") => {
      // Resolve the transition outside the updater: updaters must stay pure (StrictMode double-invokes them).
      const resolved = focusMode === next ? "none" : next;
      // When leaving Learnings focus, flush immediately to avoid draft loss.
      if (focusMode === "learnings" && resolved !== "learnings") {
        flushLearningsNow();
      }
      setFocusMode(resolved);

      if (next === "checklist") {
        if (learningsOpen) collapseLearnings();
      } else if (next === "learnings") {
        setLearningsOpen(true);
      }
    },
    [collapseLearnings, flushLearningsNow, focusMode, learningsOpen],
  );

  const openZen = useCallback((tab: "checklist" | "learnings") => {
    // Zen is intentionally isolated from the panel layout modes.
    setFocusMode("none");
    setZenTab(tab);
    if (tab === "learnings") setLearningsOpen(true);
    setZenOpen(true);
  }, []);

  const closeZen = useCallback(() => {
    // Zen editors unmount here and the panel editors remount from the refs → always in sync.
    flushLearningsNow();
    setLearningsPreview(previewTextFromTipTap(learningsBlocksRef.current));
    setZenOpen(false);
  }, [flushLearningsNow]);

  const checklistProgress =
    checklistCounts.total > 0
      ? Math.round((checklistCounts.done / checklistCounts.total) * 100)
      : 0;
  const allDone =
    checklistCounts.total > 0 && checklistCounts.done === checklistCounts.total;

  const switchZenTab = useCallback(
    (tab: "checklist" | "learnings") => {
      // Leaving learnings → flush immediately.
      if (zenTab === "learnings" && tab !== "learnings") flushLearningsNow();
      setZenTab(tab);
      if (tab === "learnings") setLearningsOpen(true);
    },
    [zenTab, flushLearningsNow],
  );

  return (
    <>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-muted/10 px-4 py-3 md:rounded-t-2xl">
            <div className="flex min-w-0 items-center gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {canEdit ? "Action" : "Read-only"}
              </p>
              <SaveStatus state={saveState} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            <div className="space-y-6 px-4 py-5 pb-8 md:px-6">
              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <div className="space-y-3">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      aria-expanded={detailsOpen}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border border-border/50 bg-muted/15 px-3 py-2.5 text-left transition-colors",
                        "hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                      )}
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                          detailsOpen && "rotate-180",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Action details
                        </p>
                        <p className="truncate text-sm font-medium text-foreground">
                          {title.trim() || "Untitled action"}
                        </p>
                      </div>
                      <span className="hidden max-w-[40%] shrink-0 truncate rounded-md bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground sm:inline-block">
                        {statusSelectOptions.find((c) => c.id === status)
                          ?.title ?? status}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden">
                    <div className="space-y-6 pt-1">
                      <div className="space-y-2">
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
                          className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0"
                        />
                      </div>

                      <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
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
                </div>
              </Collapsible>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="text-sm font-medium text-foreground">
                      Checklist
                    </h2>
                    {checklistCounts.total > 0 ? (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11px] tabular-nums",
                          allDone
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted/60 text-muted-foreground",
                        )}
                        aria-label={`${checklistCounts.done} of ${checklistCounts.total} items done`}
                      >
                        {checklistCounts.done}/{checklistCounts.total}
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Open checklist in Zen mode"
                      onClick={() => openZen("checklist")}
                    >
                      <NotebookPen className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={
                        focusMode === "checklist"
                          ? "Exit checklist focus"
                          : "Focus checklist"
                      }
                      onClick={() => setFocusModeSafe("checklist")}
                    >
                      {focusMode === "checklist" ? (
                        <Minimize2 className="h-4 w-4" />
                      ) : (
                        <Maximize2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {checklistCounts.done > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
                      aria-pressed={hideDone}
                      onClick={() => setHideDone((v) => !v)}
                    >
                      {hideDone ? (
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {hideDone
                        ? `Show done (${checklistCounts.done})`
                        : `Hide done (${checklistCounts.done})`}
                    </Button>
                  ) : (
                    <p className="hidden text-[11px] text-muted-foreground sm:block">
                      Enter = new item · Shift+Enter = line break
                    </p>
                  )}
                </div>
                {checklistCounts.total > 0 ? (
                  <div
                    className="h-1 w-full overflow-hidden rounded-full bg-muted/60"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={checklistProgress}
                  >
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300 ease-out",
                        allDone ? "bg-emerald-500" : "bg-primary",
                      )}
                      style={{ width: `${checklistProgress}%` }}
                    />
                  </div>
                ) : null}
                <div
                  className={cn(
                    "min-h-0 overflow-y-auto overscroll-contain px-0 py-1",
                    focusMode === "checklist"
                      ? "max-h-[min(74vh,680px)]"
                      : focusMode === "learnings"
                        ? "max-h-[min(28vh,260px)]"
                        : learningsOpen
                          ? "max-h-[min(42vh,380px)]"
                          : "max-h-[min(60vh,520px)]",
                    hideDone &&
                      "[&_[data-type=taskItem][data-checked=true]]:hidden",
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Unmounted while Zen is open so exactly one editor owns the document at a time. */}
                  {!zenOpen ? (
                    <BlockEditor
                      initialContent={checklistBlocksRef.current}
                      emptyContent={EMPTY_CHECKLIST_DOC}
                      onChange={(data) => scheduleBlocksPersist('checklistBlocks', data)}
                      placeholder="Add a step…"
                      members={currentTeam?.members}
                      className={!canEdit ? 'opacity-50 pointer-events-none' : ''}
                    />
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-border/40 bg-muted/10">
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5">
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-1 items-start justify-between gap-3 text-left",
                      "hover:bg-muted/0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                    )}
                    aria-expanded={learningsOpen}
                    onClick={() => {
                      if (learningsOpen) {
                        collapseLearnings();
                        if (focusMode === "learnings") setFocusMode("none");
                      } else {
                        setLearningsOpen(true);
                      }
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Lightbulb
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden
                        />
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Learnings
                        </p>
                      </div>
                      {learningsOpen ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Reflection notes. Autosaves while typing; also saves
                          when you collapse or close.
                        </p>
                      ) : learningsPreview ? (
                        <p className="mt-1 truncate text-sm text-foreground/90">
                          {learningsPreview}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Add a reflection (optional)
                        </p>
                      )}
                    </div>
                    <ChevronDown
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        learningsOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-7 w-7 shrink-0"
                    aria-label={
                      focusMode === "learnings"
                        ? "Exit learnings focus"
                        : "Focus learnings"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocusModeSafe("learnings");
                    }}
                  >
                    {focusMode === "learnings" ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-7 w-7 shrink-0"
                    aria-label="Open learnings in Zen mode"
                    onClick={(e) => {
                      e.stopPropagation();
                      openZen("learnings");
                    }}
                  >
                    <NotebookPen className="h-4 w-4" />
                  </Button>
                </div>

                {learningsOpen && !zenOpen ? (
                  <div className="space-y-2 border-t border-border/40 px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {LEARNING_PROMPTS.map((c) => (
                        <Button
                          key={c.label}
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!canEdit}
                          className="h-7 rounded-full px-3 text-xs"
                          onClick={() => appendLearningTemplate(c.heading)}
                        >
                          {c.label}
                        </Button>
                      ))}
                    </div>
                    <BlockEditor
                      ref={learningsEditorRef}
                      initialContent={learningsBlocksRef.current}
                      hideToolbar
                      onChange={(data) => scheduleBlocksPersist('learningsBlocks', data)}
                      placeholder="What did you learn? Pick a prompt above or just start writing…"
                      members={currentTeam?.members}
                      className={cn(
                        "w-full resize-y rounded-lg border border-border/50 bg-background/40",
                        focusMode === "learnings"
                          ? "max-h-[min(60vh,520px)] min-h-[180px]"
                          : "max-h-[min(40vh,280px)] min-h-[120px]",
                        !canEdit ? 'opacity-50 pointer-events-none' : ''
                      )}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

      <Dialog
        open={zenOpen}
        onOpenChange={(next) => {
          if (!next) closeZen();
          else setZenOpen(true);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl p-0 sm:w-[min(96vw,1100px)] [&>button.absolute]:hidden">
          <div className="flex h-[min(92dvh,920px)] flex-col overflow-hidden rounded-lg border border-border/60 bg-background">
            <div className="flex items-center justify-between gap-3 border-b border-border/50 bg-muted/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {title.trim() || "Untitled action"}
                </p>
                <p className="text-xs text-muted-foreground">Zen mode</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={zenTab === "checklist" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => switchZenTab("checklist")}
                >
                  Checklist
                </Button>
                <Button
                  type="button"
                  variant={zenTab === "learnings" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => switchZenTab("learnings")}
                >
                  Learnings
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={closeZen}
                >
                  Close
                </Button>
              </div>
            </div>

            {zenTab === "checklist" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {checklistCounts.total > 0 ? (
                  <div className="flex items-center gap-3 pb-3">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {checklistCounts.done}/{checklistCounts.total} done
                    </span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-300 ease-out",
                          allDone ? "bg-emerald-500" : "bg-primary",
                        )}
                        style={{ width: `${checklistProgress}%` }}
                      />
                    </div>
                  </div>
                ) : null}
                <div className="px-0 py-1">
                  <BlockEditor
                    initialContent={checklistBlocksRef.current}
                    emptyContent={EMPTY_CHECKLIST_DOC}
                    onChange={(data) => scheduleBlocksPersist('checklistBlocks', data)}
                    placeholder="Add a step…"
                    members={currentTeam?.members}
                    className={!canEdit ? 'opacity-50 pointer-events-none' : ''}
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex flex-1 flex-col px-4 py-4">
                <div className="flex flex-wrap gap-2 pb-3">
                  {LEARNING_PROMPTS.map((c) => (
                    <Button
                      key={c.label}
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!canEdit}
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => appendLearningTemplate(c.heading)}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
                <BlockEditor
                  ref={learningsEditorRef}
                  initialContent={learningsBlocksRef.current}
                  hideToolbar
                  onChange={(data) => scheduleBlocksPersist('learningsBlocks', data)}
                  placeholder="Write what you learned… (separate from the checklist)"
                  members={currentTeam?.members}
                  className={!canEdit ? 'opacity-50 pointer-events-none min-h-[300px]' : 'min-h-[300px]'}
                />
                <div className="pt-2 text-xs text-muted-foreground">
                  Autosaves while typing. Also saves when you switch tabs or
                  close Zen.
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
