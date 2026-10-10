import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  Clock3,
  GripVertical,
  MoreHorizontal,
  StickyNote,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WorkSchedulePicker } from '@/components/schedule/WorkSchedulePicker';
import {
  groupChecklistItem,
  setChecklistItemChecked,
} from '@/components/editor/reorderChecklistItem';
import type { ChecklistNoteConversionRequest } from '@/components/editor/BlockEditor';
import type { NoteType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDueDateYmdLocal } from '@/lib/due-date';
import { plannerApi } from '@/lib/api';
import type { WorkOccurrence, WorkSchedule } from '@/lib/scheduling-domain';
import { scheduleChipLabel } from '@/lib/schedule-presentation';
import {
  dispatchOccurrenceChanged,
  OCCURRENCE_CHANGED_EVENT,
  SCHEDULE_CHANGED_EVENT,
  type OccurrenceChangedDetail,
  type ScheduleChangedDetail,
} from '@/lib/schedule-events';

const COMPLETION_FEEDBACK_MS = 650;
const COMPLETION_FADE_MS = 180;

function initials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  return (first + last).toUpperCase() || '?';
}

function looksLikeANote(text: string): boolean {
  const value = text.trim();
  if (value.length >= 180) return true;
  const sentences = value.match(/[.!?](?:\s|$)/g)?.length ?? 0;
  return value.length >= 120 && sentences >= 2;
}

export const TaskItemNodeView = React.memo(
  ({ node, updateAttributes, editor, getPos }: any) => {
    const { checked, id, assigneeId, schedule: scheduleAttr } = node.attrs;
    const [schedule, setSchedule] = useState<WorkSchedule | null>(
      (scheduleAttr ?? null) as WorkSchedule | null,
    );
    const [dueOpen, setDueOpen] = useState(false);
    const [convertOpen, setConvertOpen] = useState(false);
    const [convertType, setConvertType] = useState<NoteType>('note');
    const [removeAfter, setRemoveAfter] = useState(false);
    const [converting, setConverting] = useState(false);
    const convertingRef = useRef(false);
    const [completionPending, setCompletionPending] = useState(false);
    const [completionExiting, setCompletionExiting] = useState(false);
    const [occurrenceChecked, setOccurrenceChecked] = useState(false);
    const [occurrenceLoading, setOccurrenceLoading] = useState(false);
    const [occurrenceEffectiveDate, setOccurrenceEffectiveDate] = useState<string | null>(null);
    const [occurrenceOriginDate, setOccurrenceOriginDate] = useState<string | null>(null);
    const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);
    const occurrenceRequestRef = useRef(0);
    const occurrenceMutationRef = useRef(false);

    const taskItemStorage = editor?.storage?.taskItem as
      | {
          members?: { id: string; name: string }[];
          taskId?: string;
          checklistMode?: boolean;
          hideDone?: boolean;
          canUseAdvancedReminderPresets?: boolean;
          nextCompletedAt?: () => string;
          onConvertToNote?: (request: ChecklistNoteConversionRequest) => Promise<boolean>;
        }
      | undefined;
    const memberOptions = useMemo(
      () => taskItemStorage?.members ?? [],
      [taskItemStorage?.members],
    );
    const assignedMember = useMemo(
      () => memberOptions.find((member) => member.id === assigneeId),
      [assigneeId, memberOptions],
    );
    const text = String(node.textContent ?? '').trim();
    const checklistMode = Boolean(taskItemStorage?.checklistMode);
    const disabled = !editor.isEditable;
    const today = formatDueDateYmdLocal(new Date());
    const recurring = schedule?.scheduleType === 'recurring';
    const actionableOccurrence = Boolean(
      recurring && occurrenceOriginDate && occurrenceEffectiveDate === today,
    );
    const effectiveChecked = recurring ? occurrenceChecked : Boolean(checked);
    const suggestConversion = Boolean(
      checklistMode && taskItemStorage?.onConvertToNote && !effectiveChecked && looksLikeANote(text),
    );

    const loadOccurrence = useCallback(async () => {
      const requestId = ++occurrenceRequestRef.current;
      if (
        !schedule
        || schedule.scheduleType !== 'recurring'
        || schedule.id.startsWith('optimistic:')
      ) {
        setOccurrenceLoading(false);
        setOccurrenceChecked(false);
        setOccurrenceEffectiveDate(null);
        setOccurrenceOriginDate(null);
        return;
      }
      setOccurrenceLoading(true);
      const response = await plannerApi.getOccurrence(schedule.id, today);
      if (!mountedRef.current || requestId !== occurrenceRequestRef.current) return;
      setOccurrenceLoading(false);
      if (!response.success || !response.data) {
        setOccurrenceChecked(false);
        setOccurrenceEffectiveDate(null);
        setOccurrenceOriginDate(null);
        return;
      }
      setOccurrenceChecked(response.data.state === 'completed');
      const occurrence = response.data.occurrence as WorkOccurrence | null;
      setOccurrenceEffectiveDate(occurrence?.effectiveDate ?? today);
      setOccurrenceOriginDate(occurrence?.occurrenceDate ?? today);
    }, [schedule, today]);

    useEffect(() => {
      if (!id && typeof getPos === 'function') updateAttributes({ id: uuidv4() });
    }, [getPos, id, updateAttributes]);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        occurrenceRequestRef.current += 1;
        if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
      };
    }, []);

    useEffect(() => {
      void loadOccurrence();
    }, [loadOccurrence]);

    useEffect(() => {
      const onOccurrenceChanged = (event: Event) => {
        const detail = (event as CustomEvent<OccurrenceChangedDetail>).detail;
        if (
          detail.scheduleId === schedule?.id
          && (detail.occurrenceDate === today || detail.occurrenceDate === occurrenceOriginDate)
        ) {
          void loadOccurrence();
        }
      };
      const onScheduleChanged = (event: Event) => {
        const detail = (event as CustomEvent<ScheduleChangedDetail>).detail;
        if (
          detail.source.sourceType === 'checklist_item'
          && detail.source.taskId === taskItemStorage?.taskId
          && detail.source.checklistItemId === id
        ) {
          setSchedule(detail.schedule);
        }
      };
      window.addEventListener(OCCURRENCE_CHANGED_EVENT, onOccurrenceChanged);
      window.addEventListener(SCHEDULE_CHANGED_EVENT, onScheduleChanged);
      return () => {
        window.removeEventListener(OCCURRENCE_CHANGED_EVENT, onOccurrenceChanged);
        window.removeEventListener(SCHEDULE_CHANGED_EVENT, onScheduleChanged);
      };
    }, [id, loadOccurrence, occurrenceOriginDate, schedule?.id, taskItemStorage?.taskId, today]);

    const finishGrouping = useCallback(() => {
      if (!id) return;
      groupChecklistItem(editor, id);
      if (mountedRef.current) {
        setCompletionPending(false);
        setCompletionExiting(false);
      }
    }, [editor, id]);

    const handleToggle = useCallback(
      async (next: boolean) => {
        if (disabled || next === effectiveChecked) return;
        if (recurring) {
          if (occurrenceMutationRef.current) return;
          if (!schedule || !actionableOccurrence) {
            toast.message('This recurring item is not scheduled for today.');
            return;
          }
          occurrenceMutationRef.current = true;
          setOccurrenceLoading(true);
          setOccurrenceChecked(next);
          const response = await plannerApi.mutateOccurrence({
            scheduleId: schedule.id,
            occurrenceDate: occurrenceOriginDate ?? today,
            action: next ? 'complete' : 'uncomplete',
          });
          occurrenceMutationRef.current = false;
          if (mountedRef.current) setOccurrenceLoading(false);
          if (!response.success) {
            if (mountedRef.current) setOccurrenceChecked(!next);
            toast.error(response.error || 'Could not update this occurrence');
            return;
          }
          dispatchOccurrenceChanged(schedule.id, occurrenceOriginDate ?? today);
          toast.success(next ? 'Today completed' : 'Today restored');
          return;
        }
        if (!checklistMode) {
          updateAttributes({ checked: next });
          return;
        }
        if (completionTimerRef.current) clearTimeout(completionTimerRef.current);

        updateAttributes({
          checked: next,
          completedAt: next
            ? (taskItemStorage?.nextCompletedAt?.() ?? new Date().toISOString())
            : null,
        });
        setCompletionPending(true);
        setCompletionExiting(false);

        if (next) {
          toast('Checklist item completed', {
            id: `checklist-complete-${id}`,
            duration: 4000,
            action: {
              label: 'Undo',
              onClick: () => {
                if (completionTimerRef.current) clearTimeout(completionTimerRef.current);
                if (mountedRef.current) {
                  setCompletionPending(true);
                  setCompletionExiting(false);
                }
                setChecklistItemChecked(editor, id, false);
                if (mountedRef.current) {
                  completionTimerRef.current = setTimeout(finishGrouping, 120);
                } else {
                  window.setTimeout(() => groupChecklistItem(editor, id), 120);
                }
              },
            },
          });
          completionTimerRef.current = setTimeout(() => {
            if (taskItemStorage?.hideDone) {
              setCompletionExiting(true);
              completionTimerRef.current = setTimeout(
                finishGrouping,
                COMPLETION_FADE_MS,
              );
            } else {
              finishGrouping();
            }
          }, COMPLETION_FEEDBACK_MS);
          return;
        }

        toast.dismiss(`checklist-complete-${id}`);
        completionTimerRef.current = setTimeout(finishGrouping, 120);
      }, [
        actionableOccurrence,
        checklistMode,
        disabled,
        editor,
        effectiveChecked,
        finishGrouping,
        id,
        occurrenceOriginDate,
        recurring,
        schedule,
        taskItemStorage,
        today,
        updateAttributes,
      ],
    );

    const convertToNote = useCallback(async () => {
      const convert = taskItemStorage?.onConvertToNote;
      if (!convert || !id || !text || convertingRef.current) return;
      convertingRef.current = true;
      setConverting(true);
      const success = await convert({
        taskItemId: id,
        text,
        content: {
          type: 'doc',
          content: node.toJSON().content ?? [{ type: 'paragraph' }],
        },
        type: convertType,
        removeAfter,
      });
      convertingRef.current = false;
      if (mountedRef.current) {
        setConverting(false);
      }
      if (success && mountedRef.current) setConvertOpen(false);
    }, [convertType, id, node, removeAfter, taskItemStorage, text]);

    return (
      <NodeViewWrapper
        className={cn(
          'group/checkitem my-1.5 flex flex-wrap items-start gap-x-1.5 transition-[opacity,transform] duration-200',
          completionExiting && 'translate-y-[-2px] opacity-0',
        )}
        data-type="taskItem"
        data-task-id={id}
        data-checked={effectiveChecked ? 'true' : 'false'}
        data-completion-pending={completionPending ? 'true' : 'false'}
        onDragEnd={() => {
          if (checklistMode && id && !recurring) {
            window.setTimeout(() => groupChecklistItem(editor, id), 0);
          }
        }}
      >
        <div
          className="mt-[2px] flex select-none items-center justify-center"
          contentEditable={false}
        >
          <div
            className={cn(
              'mr-0.5 touch-none px-0.5 py-0.5 text-muted-foreground/30 transition-colors',
              effectiveChecked
                ? 'cursor-default opacity-50'
                : 'cursor-grab hover:text-muted-foreground',
            )}
            data-drag-handle={effectiveChecked ? undefined : ''}
            onDragStart={(event) => {
              if (effectiveChecked) event.preventDefault();
            }}
            onTouchStart={(event) => {
              if (!editor?.isEditable || !id || effectiveChecked) return;
              if (
                !window.matchMedia('(pointer: coarse)').matches &&
                !('ontouchstart' in window)
              ) return;
              event.stopPropagation();

              const handle = event.currentTarget as HTMLElement;
              const row = handle.closest('[data-type="taskItem"]') as HTMLElement | null;
              if (!row) return;
              const touch = event.touches[0];
              const rect = row.getBoundingClientRect();
              const offsetY = touch.clientY - rect.top;
              const offsetX = touch.clientX - rect.left;
              const ghost = row.cloneNode(true) as HTMLElement;
              Object.assign(ghost.style, {
                position: 'fixed',
                top: '0px',
                left: '0px',
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                margin: '0px',
                transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
                zIndex: '99999',
                pointerEvents: 'none',
                opacity: '0.95',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                backgroundColor: 'hsl(var(--background))',
                borderRadius: 'var(--radius)',
              });
              document.body.appendChild(ghost);
              row.style.opacity = '0.3';

              let lastTarget: HTMLElement | null = null;
              let dropPosition: 'before' | 'after' = 'after';
              const clearTarget = () => {
                if (!lastTarget) return;
                lastTarget.style.borderTop = '';
                lastTarget.style.borderBottom = '';
              };
              const onTouchMove = (moveEvent: TouchEvent) => {
                moveEvent.preventDefault();
                const current = moveEvent.touches[0];
                ghost.style.transform = `translate3d(${current.clientX - offsetX}px, ${current.clientY - offsetY}px, 0)`;
                const target = document
                  .elementFromPoint(current.clientX, current.clientY)
                  ?.closest('[data-type="taskItem"]') as HTMLElement | null;
                clearTarget();
                if (
                  !target ||
                  target === row ||
                  target.getAttribute('data-checked') !== row.getAttribute('data-checked')
                ) {
                  lastTarget = null;
                  return;
                }
                const targetRect = target.getBoundingClientRect();
                dropPosition = current.clientY < targetRect.top + targetRect.height / 2
                  ? 'before'
                  : 'after';
                target.style[dropPosition === 'before' ? 'borderTop' : 'borderBottom'] =
                  '2px solid hsl(var(--primary))';
                lastTarget = target;
              };
              const onTouchEnd = () => {
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend', onTouchEnd);
                ghost.remove();
                row.style.opacity = '';
                clearTarget();
                const targetId = lastTarget?.getAttribute('data-task-id');
                if (!targetId || targetId === id) return;

                const json = editor.getJSON();
                let sourceNode: any = null;
                const removeNode = (nodes: any[]): boolean => {
                  for (let index = 0; index < nodes.length; index += 1) {
                    if (nodes[index].type === 'taskItem' && nodes[index].attrs?.id === id) {
                      sourceNode = nodes.splice(index, 1)[0];
                      return true;
                    }
                    if (nodes[index].content && removeNode(nodes[index].content)) return true;
                  }
                  return false;
                };
                const insertNode = (nodes: any[]): boolean => {
                  for (let index = 0; index < nodes.length; index += 1) {
                    if (nodes[index].type === 'taskItem' && nodes[index].attrs?.id === targetId) {
                      nodes.splice(dropPosition === 'before' ? index : index + 1, 0, sourceNode);
                      return true;
                    }
                    if (nodes[index].content && insertNode(nodes[index].content)) return true;
                  }
                  return false;
                };
                if (json.content && removeNode(json.content) && sourceNode) {
                  insertNode(json.content);
                  editor.commands.setContent(json, { emitUpdate: true });
                }
              };
              document.addEventListener('touchmove', onTouchMove, { passive: false });
              document.addEventListener('touchend', onTouchEnd);
            }}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          <Checkbox
            checked={effectiveChecked}
            disabled={disabled || occurrenceLoading || (recurring && !actionableOccurrence)}
            onCheckedChange={(value) => void handleToggle(Boolean(value))}
            className={cn(
              'h-[18px] w-[18px] rounded border-border/50 shadow-sm transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary',
              effectiveChecked && 'opacity-80',
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative flex min-w-0 items-start gap-1">
            <NodeViewContent
              className={cn(
                'mt-[1px] inline-block min-w-0 flex-1',
                effectiveChecked && 'text-muted-foreground line-through',
              )}
            />

            <div
              className="ml-1 flex shrink-0 items-center gap-1"
              contentEditable={false}
            >
              {assignedMember ? (
                <span
                  className="inline-flex h-5 items-center gap-1 rounded-md bg-primary/10 px-1.5 text-[10px] font-medium text-primary"
                  title={`Assigned to ${assignedMember.name}`}
                >
                  <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-primary/15 text-[8px] font-bold">
                    {initials(assignedMember.name)}
                  </span>
                  <span className="hidden max-w-20 truncate sm:inline">{assignedMember.name}</span>
                </span>
              ) : null}
              {schedule ? (
                <span
                  className="inline-flex h-5 items-center gap-1 rounded-md bg-muted/60 px-1.5 text-[10px] text-muted-foreground"
                  title={`Scheduled ${scheduleChipLabel(schedule)}`}
                >
                  <CalendarIcon className="h-3 w-3" aria-hidden />
                  {scheduleChipLabel(schedule)}
                  {schedule.reminderRules.length > 0 ? (
                    <Clock3 className="h-3 w-3" aria-label="Reminder set" />
                  ) : null}
                </span>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    className="h-6 w-6 rounded-md opacity-0 transition-opacity group-hover/checkitem:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                    aria-label="Checklist item actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <UserRound className="mr-2 h-4 w-4" aria-hidden />
                      Assign
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                      <DropdownMenuItem onSelect={() => updateAttributes({ assigneeId: null })}>
                        <UserRound className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
                        Unassigned
                        {!assigneeId ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
                      </DropdownMenuItem>
                      {memberOptions.map((member) => (
                        <DropdownMenuItem
                          key={member.id}
                          onSelect={() => updateAttributes({ assigneeId: member.id })}
                        >
                          <span className="mr-2 grid h-5 w-5 place-items-center rounded-full bg-muted text-[9px] font-semibold">
                            {initials(member.name)}
                          </span>
                          <span className="truncate">{member.name}</span>
                          {assigneeId === member.id ? (
                            <Check className="ml-auto h-4 w-4 text-primary" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem onSelect={() => setDueOpen(true)}>
                    <CalendarIcon className="mr-2 h-4 w-4" aria-hidden />
                    Schedule
                  </DropdownMenuItem>
                  {taskItemStorage?.onConvertToNote ? (
                    <DropdownMenuItem
                      disabled={!text}
                      onSelect={() => setConvertOpen(true)}
                    >
                      <StickyNote className="mr-2 h-4 w-4" aria-hidden />
                      Convert to Note
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {suggestConversion ? (
            <button
              type="button"
              contentEditable={false}
              onClick={() => setConvertOpen(true)}
              className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <StickyNote className="h-3 w-3" aria-hidden />
              This looks like a note <span aria-hidden>→</span> Convert to Note
            </button>
          ) : null}
        </div>

        <Dialog open={dueOpen} onOpenChange={setDueOpen}>
          <DialogContent
            hideClose
            onCloseAutoFocus={(event) => event.preventDefault()}
            className="flex max-h-[92dvh] min-h-0 w-[min(92vw,380px)] max-w-[min(92vw,380px)] flex-col gap-0 overflow-hidden p-0"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Schedule checklist item</DialogTitle>
              <DialogDescription>
                Choose a date, recurrence, time, or reminder for this checklist item.
              </DialogDescription>
            </DialogHeader>
            {taskItemStorage?.taskId && id ? (
            <WorkSchedulePicker
              source={{
                sourceType: 'checklist_item',
                taskId: taskItemStorage.taskId,
                checklistItemId: id,
              }}
              initialSchedule={schedule}
              canUseAdvancedReminderPresets={Boolean(
                taskItemStorage?.canUseAdvancedReminderPresets,
              )}
              disabled={disabled}
              onOptimisticScheduleChange={setSchedule}
              onScheduleChange={setSchedule}
              onRequestClose={() => setDueOpen(false)}
            />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Scheduling is unavailable for this item.</p>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={convertOpen} onOpenChange={(open) => !converting && setConvertOpen(open)}>
          <DialogContent className="w-[min(92vw,420px)] gap-5">
            <DialogHeader>
              <DialogTitle>Convert to Note</DialogTitle>
              <DialogDescription>
                Create a reusable note from this checklist item. The checklist changes only after the note is saved.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-foreground/85">
                <p className="line-clamp-4 whitespace-pre-wrap">{text}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Note type</label>
                <Select value={convertType} onValueChange={(value) => setConvertType(value as NoteType)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="learning">Learning</SelectItem>
                    <SelectItem value="idea">Idea</SelectItem>
                    <SelectItem value="decision">Decision</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 p-3 text-sm">
                <Checkbox
                  checked={removeAfter}
                  onCheckedChange={(value) => setRemoveAfter(Boolean(value))}
                  disabled={converting}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">Remove from checklist after conversion</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Leave this off to keep the execution item in place.
                  </span>
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConvertOpen(false)} disabled={converting}>
                Cancel
              </Button>
              <Button onClick={() => void convertToNote()} disabled={converting || !text}>
                {converting ? 'Creating…' : 'Create note'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </NodeViewWrapper>
    );
  },
);

TaskItemNodeView.displayName = 'TaskItemNodeView';
