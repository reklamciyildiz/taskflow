'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  MessageCircle, 
  Paperclip, 
  MoreVertical,
  AlertTriangle,
  Calendar,
  GripVertical,
  ArrowRightLeft,
  ListTodo,
  CheckCircle2
} from 'lucide-react';
import { useTaskContext, type Task } from '@/components/TaskContext';
import { cn } from '@/lib/utils';
import { format, isToday, isTomorrow, isPast } from 'date-fns';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isTerminalBoardColumn, type ProjectColumnConfig } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  dragHandleProps?: any;
  onTaskClick?: (task: Task) => void;
  propertyBadges?: { id: string; label: string; colorClass: string }[];
}

const priorityColors = {
  low: 'border-slate-500/20 bg-slate-500/[0.075] text-slate-600 dark:text-slate-300',
  medium: 'border-blue-500/20 bg-blue-500/[0.085] text-blue-600 dark:text-blue-300',
  high: 'border-amber-500/25 bg-amber-500/[0.09] text-amber-700 dark:text-amber-300',
  urgent: 'border-rose-500/25 bg-rose-500/[0.09] text-rose-600 dark:text-rose-300',
};
const priorityAccents = {
  low: 'bg-slate-400/75',
  medium: 'bg-blue-400/85',
  high: 'bg-amber-400/90',
  urgent: 'bg-rose-400',
};

export function TaskCard({ task, dragHandleProps, onTaskClick, propertyBadges = [] }: TaskCardProps) {
  const { currentTeam, updateTask, deleteTask, canEditTask, canDeleteTask, boardColumns, canCompleteTask, suppressTaskEditorOpenFor } = useTaskContext();
  /** After ⋮ → Change status, the menu close can trigger a ghost click on mobile; prevent opening the modal briefly. */
  const blockCardOpenUntilRef = useRef(0);
  const movePendingRef = useRef(false);
  const [movePending, setMovePending] = useState(false);
  
  // Check permissions for this task
  const canEdit = canEditTask(task.createdBy, task.assigneeId);
  const canDelete = canDeleteTask(task.createdBy);
  const canComplete = canCompleteTask(task.assigneeId);
  
  const assignee = currentTeam?.members.find(m => m.id === task.assigneeId);
  
  const getDueDateDisplay = () => {
    if (!task.dueDate) return null;
    
    if (isToday(task.dueDate)) return 'Today';
    if (isTomorrow(task.dueDate)) return 'Tomorrow';
    return format(task.dueDate, 'MMM d');
  };
  
  const isCompleted = isTerminalBoardColumn(task.status, boardColumns);
  const isDueSoon = task.dueDate && isPast(task.dueDate) && !isCompleted;

  const handleCardClick = (e: React.MouseEvent) => {
    if (Date.now() < blockCardOpenUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Don't open modal if clicking on dropdown menu or drag handle
    const target = e.target as HTMLElement;
    if (target.closest('button, [role="button"], [role="menuitem"], [data-drag-handle]')) {
      return;
    }
    onTaskClick?.(task);
  };

  return (
    <Card 
      className="actiproc-task-card group relative flex min-h-[152px] min-w-0 cursor-pointer flex-col overflow-hidden rounded-[18px] border border-border/70 bg-card/90 p-0 shadow-[0_8px_26px_-19px_rgba(15,23,42,0.6)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-primary/30 hover:bg-card hover:shadow-[0_15px_32px_-18px_rgba(15,23,42,0.5)] focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/15"
      aria-busy={movePending}
      data-board-action-card={task.id}
      onClick={handleCardClick}
    >
      <div aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[3px]', priorityAccents[task.priority])} />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-3.5 pb-3.5 pt-3.5 sm:px-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/85">
              {isCompleted ? <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-hidden />
                : <ListTodo className="h-3 w-3 text-primary/65" aria-hidden />}
              {isCompleted ? 'Completed Action' : 'Action'}
            </div>
            <div className="flex min-w-0 items-start gap-1.5">
            {dragHandleProps ? (
              <div 
                {...dragHandleProps}
                data-drag-handle="true"
                className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-muted-foreground/70 opacity-30 transition-opacity hover:bg-muted/70 hover:opacity-100 active:cursor-grabbing group-hover:opacity-100 focus-visible:opacity-100" aria-label="Drag Action to reorder"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/70" />
              </div>
            ) : null}
            <button type="button" onClick={() => onTaskClick?.(task)} className="min-w-0 flex-1 break-words text-left text-[13px] font-semibold leading-[1.5] tracking-[-0.012em] text-foreground line-clamp-3 hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={task.title}>
              {task.title}
            </button>
            </div>
          </div>
          {(canEdit || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  aria-label={`Move or edit ${task.title}`}
                  disabled={movePending}
                  className={cn(
                    'h-11 shrink-0 gap-1 rounded-xl border border-transparent px-2 text-muted-foreground md:mt-0.5 md:h-8 md:w-8 md:p-0 transition-[opacity,background-color,border-color] hover:border-border/60 hover:bg-muted/65',
                    // Mobile: always visible. Desktop: show on hover.
                    'opacity-100 md:opacity-25 md:group-hover:opacity-100 md:focus-visible:opacity-100'
                  )}
                >
                  <MoreVertical className="h-4 w-4" aria-hidden />
                  <span className="text-xs md:hidden">{canEdit ? 'Move to' : 'Actions'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {canEdit && (
                  <>
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4" />
                      Move to stage
                    </DropdownMenuLabel>
                    {boardColumns.map((col: ProjectColumnConfig) => {
                      const isCurrent = col.id === task.status;
                      const isTerminal = isTerminalBoardColumn(col.id, boardColumns);
                      const blocked = isTerminal && !canComplete;
                      return (
                        <DropdownMenuItem
                          key={col.id}
                          disabled={isCurrent || blocked || movePending}
                          className="min-h-[44px] md:min-h-0"
                          onSelect={(e) => {
                            e.stopPropagation();
                            if (movePendingRef.current) return;
                            movePendingRef.current = true;
                            setMovePending(true);
                            suppressTaskEditorOpenFor(1000);
                            blockCardOpenUntilRef.current = Date.now() + 550;
                            void updateTask(task.id, { status: col.id }).then(ok => {
                              if (!ok) toast.error('Stage could not be saved. The previous stage was restored.');
                            }).finally(() => { movePendingRef.current = false; setMovePending(false); });
                          }}
                        >
                          {col.title}
                          {isCurrent ? <span className="ml-auto text-xs text-muted-foreground">Current</span> : null}
                          {blocked ? <span className="ml-auto text-xs text-muted-foreground">Permission</span> : null}
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                  </>
                )}
                {canEdit && (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Open first, then arm the ghost-click guard: `openTaskEditor` is a no-op
                      // while suppressed, so the previous order silently swallowed this action.
                      onTaskClick?.(task);
                      suppressTaskEditorOpenFor(1000);
                    }}
                  >
                    Edit action
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem 
                    className="text-red-600 focus:text-red-600"
                    onSelect={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      suppressTaskEditorOpenFor(1500);
                      blockCardOpenUntilRef.current = Date.now() + 700;
                      void deleteTask(task.id);
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <p className="line-clamp-2 text-[11px] leading-[1.55] text-muted-foreground">
            {task.description}
          </p>
        )}

        {/* Attachments preview */}
        {task.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.attachments.slice(0, 2).map((attachment, index) => (
              <div key={index} className="flex max-w-full items-center gap-1 rounded-lg border border-border/50 bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
                <Paperclip className="h-3 w-3" />
                <span className="truncate max-w-20">{attachment}</span>
              </div>
            ))}
            {task.attachments.length > 2 && (
              <div className="px-2 py-1 text-[10px] text-muted-foreground">
                +{task.attachments.length - 2} more
              </div>
            )}
          </div>
        )}

        {/* Customer Badge */}
        {task.customerName && (
          <Badge 
            variant="outline" 
            className="max-w-full truncate rounded-full border-violet-500/20 bg-violet-500/[0.075] px-2.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300"
          >
            {task.customerName}
          </Badge>
        )}

        {propertyBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {propertyBadges.slice(0, 2).map((badge) => (
              <Badge key={badge.id} variant="outline" className="max-w-full gap-1.5 rounded-full border-border/60 bg-muted/25 px-2.5 py-1 text-[10px] font-medium text-foreground/85">
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', badge.colorClass)} />
                <span className="truncate">{badge.label}</span>
              </Badge>
            ))}
          </div>
        )}

        {/* Priority and Due Date */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border/45 pt-2.5">
          <Badge 
            variant="secondary" 
            className={cn("gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.025em] shadow-none", priorityColors[task.priority])}
          >
            <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', priorityAccents[task.priority])} />
              {task.priority.toUpperCase()}
          </Badge>
          
          {task.dueDate && (
            <div className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium",
              isDueSoon 
                ? "border-rose-500/20 bg-rose-500/[0.08] text-rose-600 dark:text-rose-300"
                : "border-border/60 bg-muted/35 text-muted-foreground"
            )}>
              {isDueSoon ? (
                <AlertTriangle className="h-3 w-3" />
              ) : (
                <Calendar className="h-3 w-3" />
              )}
              <span>{getDueDateDisplay()}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {(assignee || task.attachments.length > 0 || task.comments.length > 0) && <div className="flex items-center justify-between gap-2 pt-0.5">
          {/* Assignee */}
          <div className="flex items-center gap-2">
            {assignee && (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6 border border-border/70 ring-2 ring-background">
                  <AvatarImage src={assignee.avatar} alt={assignee.name} />
                  <AvatarFallback className="text-xs">
                    {assignee.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[110px] truncate text-[11px] font-medium text-muted-foreground">
                  {assignee.name.split(' ')[0]}
                </span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            {task.attachments.length > 0 && (
              <div className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                <span>{task.attachments.length}</span>
              </div>
            )}
            {task.comments.length > 0 && (
              <div className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                <span>{task.comments.length}</span>
              </div>
            )}
          </div>
        </div>}
      </div>
    </Card>
  );
}
