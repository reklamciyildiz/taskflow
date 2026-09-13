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
  Lightbulb,
  ListChecks,
  Loader2,
  Maximize2,
  Minimize2,
  UserRound,
  X,
} from "lucide-react";
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
import { BlockEditor } from '@/components/editor/BlockEditor';
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
import { v4 as uuidv4 } from "uuid";
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
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Already flushes drafts (see `requestClose` in `ActionPanel`). */
  onClose: () => void;
  flushRef: MutableRefObject<(() => void) | null>;
}

type BlocksField = "checklistBlocks" | "learningsBlocks";
type SaveState = "idle" | "saving" | "saved" | "error";
type WorkTab = "checklist" | "learnings";

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
const BLOCKS_SAVE_MS = 500;

/**
 * A brand-new checklist starts as a task list, not a plain paragraph the user has to convert.
 * The seed row carries an id up front: `TaskItemNodeView` back-fills missing ids with a
 * transaction, which would otherwise fire `onUpdate` → a PATCH the moment the panel opens.
 */
function emptyChecklistDoc() {
  return {
    type: "doc",
    content: [
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: false, id: uuidv4() },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
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
  /**
   * TipTap documents. The refs are the single source of truth for the *latest* content.
   * Exactly one editor per document is mounted at a time (the active tab), and it always
   * mounts from the ref — so switching tabs never shows stale text.
   */
  const checklistBlocksRef = useRef<any>(resolveChecklistBlocks(task));
  const learningsBlocksRef = useRef<any>(resolveLearningsBlocks(task));
  /** Stable per mount so re-renders and tab switches never reseed a different id. */
  const emptyChecklistRef = useRef<any>(null);
  if (emptyChecklistRef.current === null) emptyChecklistRef.current = emptyChecklistDoc();
  const [checklistCounts, setChecklistCounts] = useState<TaskItemCounts>(() =>
    countTaskItems(checklistBlocksRef.current),
  );
  const [hideDone, setHideDone] = useState(false);
  /** Drives the small indicator dot on the Learnings tab. */
  const [learningsHasContent, setLearningsHasContent] = useState(
    () => previewTextFromTipTap(learningsBlocksRef.current, 1).length > 0,
  );

  /** Which document is open. Checklist first: it is the working surface; learnings are the retro. */
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
        const has = previewTextFromTipTap(data, 1).length > 0;
        setLearningsHasContent((prev) => (prev === has ? prev : has));
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
      if (next !== "checklist" && next !== "learnings") return;
      if (next === tab) return;
      persistBlocksNow(
        tab === "checklist" ? "checklistBlocks" : "learningsBlocks",
      );
      setTab(next);
    },
    [persistBlocksNow, tab],
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
                "relative h-11 gap-2 rounded-none px-3 text-sm font-medium text-muted-foreground shadow-none",
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
              value="learnings"
              className={cn(
                "relative h-11 gap-2 rounded-none px-3 text-sm font-medium text-muted-foreground shadow-none",
                "data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent",
                "data-[state=active]:after:bg-primary",
              )}
            >
              <Lightbulb className="h-4 w-4" aria-hidden />
              Learnings
              {learningsHasContent ? (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-amber-500"
                  aria-label="Has notes"
                />
              ) : null}
            </TabsTrigger>
          </TabsList>

          {tab === "checklist" && checklistCounts.done > 0 ? (
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
              hideDone && "[&_[data-type=taskItem][data-checked=true]]:hidden",
            )}
          >
            <BlockEditor
              initialContent={checklistBlocksRef.current}
              emptyContent={emptyChecklistRef.current}
              hideToolbar
              onChange={(data) => scheduleBlocksPersist("checklistBlocks", data)}
              placeholder="Add a step…"
              members={currentTeam?.members}
              className={!canEdit ? "pointer-events-none opacity-60" : ""}
            />
            {hideDone && allDone ? (
              <p className="px-1 pt-2 text-xs text-muted-foreground">
                Everything is done — all {checklistCounts.total} items are hidden.
              </p>
            ) : null}
          </TabsContent>

          <TabsContent
            value="learnings"
            className="mt-0 flex flex-col px-4 py-4 outline-none md:px-6"
          >
            <BlockEditor
              initialContent={learningsBlocksRef.current}
              hideToolbar
              onChange={(data) => scheduleBlocksPersist("learningsBlocks", data)}
              placeholder="What did you learn? What would you do differently next time?"
              members={currentTeam?.members}
              className={cn(
                "min-h-[220px]",
                !canEdit ? "pointer-events-none opacity-60" : "",
              )}
            />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
