'use client';

import { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  MessageCircle, 
  Paperclip, 
  MoreVertical,
  AlertTriangle,
  Calendar,
  GripVertical,
  ArrowRightLeft
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
}

const priorityColors = {
  low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  high: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
};

export function TaskCard({ task, dragHandleProps, onTaskClick }: TaskCardProps) {
  const { currentTeam, updateTask, deleteTask, canEditTask, canDeleteTask, boardColumns, canCompleteTask, suppressTaskEditorOpenFor } = useTaskContext();
  /** After ⋮ → Statü değiştir, menü kapanırken mobilde hayalet tık kart onClick'ine düşebilir; kısa süre modal açılmasın. */
  const blockCardOpenUntilRef = useRef(0);
  
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
  
  const isDueSoon = task.dueDate && isPast(task.dueDate) && task.status !== 'done';

  const handleCardClick = (e: React.MouseEvent) => {
    if (Date.now() < blockCardOpenUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Don't open modal if clicking on dropdown menu or drag handle
    const target = e.target as HTMLElement;
    if (target.closest('[role="button"]') || target.closest('[data-drag-handle]')) {
      return;
    }
    onTaskClick?.(task);
  };

  return (
    <Card 
      className="p-4 bg-card hover:shadow-md transition-all duration-200 group border cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {dragHandleProps && (
              <div 
                {...dragHandleProps}
                data-drag-handle="true"
                className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <h4 className="font-medium text-sm line-clamp-2 leading-relaxed flex-1">
              {task.title}
            </h4>
          </div>
          {(canEdit || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn(
                    'h-6 w-6 p-0 transition-opacity',
                    // Mobile: always visible. Desktop: show on hover.
                    'opacity-100 md:opacity-0 md:group-hover:opacity-100'
                  )}
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {canEdit && (
                  <>
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <ArrowRightLeft className="h-4 w-4" />
                      Statü değiştir
                    </DropdownMenuLabel>
                    {boardColumns.map((col: ProjectColumnConfig) => {
                      const isCurrent = col.id === task.status;
                      const isTerminal = isTerminalBoardColumn(col.id, boardColumns);
                      const blocked = isTerminal && !canComplete;
                      return (
                        <DropdownMenuItem
                          key={col.id}
                          disabled={isCurrent || blocked}
                          onSelect={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            suppressTaskEditorOpenFor(1000);
                            blockCardOpenUntilRef.current = Date.now() + 550;
                            void updateTask(task.id, { status: col.id });
                          }}
                        >
                          {col.title}
                          {isCurrent ? <span className="ml-auto text-xs text-muted-foreground">Şu an</span> : null}
                          {blocked ? <span className="ml-auto text-xs text-muted-foreground">Yetki</span> : null}
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
                      suppressTaskEditorOpenFor(1000);
                      onTaskClick?.(task);
                    }}
                  >
                    Aksiyonu düzenle
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
                    Sil
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        )}

        {/* Attachments preview */}
        {task.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.attachments.slice(0, 2).map((attachment, index) => (
              <div key={index} className="flex items-center gap-1 text-xs bg-muted/50 px-2 py-1 rounded">
                <Paperclip className="h-3 w-3" />
                <span className="truncate max-w-20">{attachment}</span>
              </div>
            ))}
            {task.attachments.length > 2 && (
              <div className="text-xs text-muted-foreground px-2 py-1">
                +{task.attachments.length - 2} more
              </div>
            )}
          </div>
        )}

        {/* Customer Badge */}
        {task.customerName && (
          <Badge 
            variant="outline" 
            className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-700"
          >
            {task.customerName}
          </Badge>
        )}

        {/* Priority and Due Date */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge 
            variant="secondary" 
            className={cn("text-xs px-2 py-0.5", priorityColors[task.priority])}
          >
            {task.priority.toUpperCase()}
          </Badge>
          
          {task.dueDate && (
            <div className={cn(
              "flex items-center gap-1 text-xs px-2 py-0.5 rounded-md",
              isDueSoon 
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" 
                : "bg-muted text-muted-foreground"
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
        <div className="flex items-center justify-between pt-2">
          {/* Assignee */}
          <div className="flex items-center gap-2">
            {assignee && (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={assignee.avatar} alt={assignee.name} />
                  <AvatarFallback className="text-xs">
                    {assignee.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-muted-foreground">
                  {assignee.name.split(' ')[0]}
                </span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
        </div>
      </div>
    </Card>
  );
}