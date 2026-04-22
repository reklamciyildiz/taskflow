'use client';

import { useState, useMemo, useEffect } from 'react';
import { useTaskContext, TaskPriority } from '@/components/TaskContext';
import {
  resolveTaskBoardColumnId,
  isTerminalBoardColumn,
  type ProjectColumnConfig,
} from '@/lib/types';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { EditGeneralBoardModal } from '@/components/EditGeneralBoardModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Search, 
  Filter, 
  SortAsc, 
  Calendar,
  User,
  Flag,
  MoreHorizontal,
  CheckCircle2,
  Paperclip,
  MessageCircle,
  Layers,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isPast } from 'date-fns';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Badge fallbacks for known ids when a column has no `color` configured. */
const LEGACY_COLUMN_BADGE: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  progress: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  review: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
};

function columnBadgeClass(columnId: string, columns: ProjectColumnConfig[]): string {
  const col = columns.find((c) => c.id === columnId);
  if (col?.color) return col.color;
  return LEGACY_COLUMN_BADGE[columnId] ?? 'bg-muted text-muted-foreground';
}

function columnLabel(columnId: string, columns: ProjectColumnConfig[]): string {
  return columns.find((c) => c.id === columnId)?.title ?? columnId;
}

const priorityConfig = {
  low: { label: 'Low', color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  medium: { label: 'Medium', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  high: { label: 'High', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' }
};

export function TaskList() {
  const {
    tasks,
    currentTeam,
    boardScope,
    setBoardScope,
    boardProject,
    projects,
    currentUserRole,
    updateTask,
    deleteTask,
    canCompleteTask,
    canEditTask,
    canDeleteTask,
    openTaskEditor,
    boardColumns,
  } = useTaskContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'created'>('dueDate');
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editGeneralOpen, setEditGeneralOpen] = useState(false);

  useEffect(() => {
    if (filterStatus === 'all') return;
    if (!boardColumns.some((c) => c.id === filterStatus)) {
      setFilterStatus('all');
    }
  }, [boardColumns, filterStatus]);

  const projectsForTeam = useMemo(() => {
    if (!currentTeam) return projects;
    return projects.filter((p) => !p.teamId || p.teamId === currentTeam.id);
  }, [projects, currentTeam?.id]);

  const filteredTasks = useMemo(() => {
    let list = tasks.filter((task) => task.teamId === currentTeam?.id);

    if (boardScope.type === 'general') {
      list = list.filter((task) => task.projectId == null);
    } else {
      list = list.filter((task) => task.projectId === boardScope.projectId);
    }

    const q = searchQuery.toLowerCase();
    list = list.filter(
      (task) =>
        task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q)
    );
    list = list.filter((task) => {
      if (filterStatus === 'all') return true;
      return resolveTaskBoardColumnId(task.status, boardColumns) === filterStatus;
    });
    list = list.filter((task) => filterPriority === 'all' || task.priority === filterPriority);

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'dueDate':
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.getTime() - b.dueDate.getTime();
        case 'priority': {
          const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        case 'created':
          return b.createdAt.getTime() - a.createdAt.getTime();
        default:
          return 0;
      }
    });
  }, [
    tasks,
    currentTeam?.id,
    boardScope,
    searchQuery,
    filterStatus,
    filterPriority,
    sortBy,
    boardColumns,
  ]);

  const listSubtitle =
    boardScope.type === 'general'
      ? 'General actions (not tied to a process) — shared process selection with the board'
      : `Process: ${boardProject?.name ?? 'Selected process'} — shared filters with the board`;

  const toggleTaskComplete = (
    taskId: string,
    assigneeId: string | null | undefined,
    resolvedColumnId: string
  ) => {
    if (!canCompleteTask(assigneeId)) return;
    const terminalNow = isTerminalBoardColumn(resolvedColumnId, boardColumns);
    if (terminalNow) {
      const openCol = boardColumns.find((c) => !isTerminalBoardColumn(c.id, boardColumns));
      void updateTask(taskId, { status: openCol?.id ?? 'todo' });
    } else {
      const termCol = boardColumns.find((c) => isTerminalBoardColumn(c.id, boardColumns));
      void updateTask(taskId, { status: termCol?.id ?? 'done' });
    }
  };

  return (
    <div className="h-full">
      <div className="mb-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Action list</h1>
          <p className="mt-1 text-muted-foreground text-sm">{listSubtitle}</p>
        </div>
        {projectsForTeam.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={boardScope.type === 'general' ? '__general__' : boardScope.projectId}
              onValueChange={(v) => {
                if (v === '__general__') setBoardScope({ type: 'general' });
                else setBoardScope({ type: 'project', projectId: v });
              }}
            >
              <SelectTrigger
                className="h-10 w-full min-w-[200px] max-w-md sm:w-auto"
                aria-label="List scope — process or general actions"
              >
                <SelectValue placeholder="Choose process" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__general__">General actions</SelectItem>
                {projectsForTeam.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentUserRole === 'admin' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 gap-2"
                  onClick={() => setIsCreateProjectOpen(true)}
                  title="Create a new process (project)"
                >
                  <Layers className="h-4 w-4" />
                  New process
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => {
                    if (boardScope.type === 'general') setEditGeneralOpen(true);
                    else setEditingProjectId(boardProject?.id ?? null);
                  }}
                  disabled={boardScope.type !== 'general' && !boardProject}
                  title={
                    boardScope.type === 'general' ? 'Edit general columns' : 'Edit selected process'
                  }
                  aria-label={
                    boardScope.type === 'general' ? 'Edit general columns' : 'Edit selected process'
                  }
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search actions…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 max-w-[min(100%,14rem)] sm:max-w-[16rem]">
                <Filter className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  Status: {filterStatus === 'all' ? 'All' : columnLabel(filterStatus, boardColumns)}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[min(60vh,320px)] overflow-y-auto">
              <DropdownMenuItem onClick={() => setFilterStatus('all')}>All statuses</DropdownMenuItem>
              {boardColumns.map((col) => (
                <DropdownMenuItem key={col.id} onClick={() => setFilterStatus(col.id)}>
                  {col.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Flag className="h-4 w-4" />
                Priority: {filterPriority === 'all' ? 'All' : priorityConfig[filterPriority as TaskPriority].label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setFilterPriority('all')}>
                All Priorities
              </DropdownMenuItem>
              {Object.entries(priorityConfig).map(([priority, config]) => (
                <DropdownMenuItem 
                  key={priority} 
                  onClick={() => setFilterPriority(priority as TaskPriority)}
                >
                  {config.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SortAsc className="h-4 w-4" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSortBy('dueDate')}>
                Due Date
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('priority')}>
                Priority
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('created')}>
                Created Date
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {filteredTasks.map((task) => {
          const assignee = currentTeam?.members.find(m => m.id === task.assigneeId);
          const resolvedCol = resolveTaskBoardColumnId(task.status, boardColumns);
          const isTerminal = isTerminalBoardColumn(resolvedCol, boardColumns);
          const isDueSoon = task.dueDate && isPast(task.dueDate) && !isTerminal;
          
          const getDueDateDisplay = () => {
            if (!task.dueDate) return null;
            if (isToday(task.dueDate)) return 'Today';
            if (isPast(task.dueDate)) return format(task.dueDate, 'MMM d') + ' (Overdue)';
            return format(task.dueDate, 'MMM d');
          };

          const handleTaskRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
            const target = e.target as HTMLElement;
            // Checkbox slot (expanded hit target) or row controls — don't open editor on row click.
            if (target.closest('[data-task-list-checkbox-slot]')) return;
            if (target.closest('button')) return;
            openTaskEditor(task.id);
          };

          return (
            <Card 
              key={task.id} 
              className={cn(
                "p-4 hover:shadow-md transition-all duration-200 group cursor-pointer",
                isTerminal && "opacity-75"
              )}
              onClick={handleTaskRowClick}
            >
              <div className="flex items-center gap-4">
                {/* Checkbox: larger target + stays on top; avoid clicks falling through when disabled */}
                <div
                  data-task-list-checkbox-slot
                  className="relative z-10 flex shrink-0 items-center justify-center self-start rounded-md p-1.5 -m-1.5 min-h-9 min-w-9"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={isTerminal}
                    onCheckedChange={() => toggleTaskComplete(task.id, task.assigneeId, resolvedCol)}
                    disabled={!canCompleteTask(task.assigneeId)}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className={cn(
                        "font-medium text-sm mb-1",
                        isTerminal && "line-through text-muted-foreground"
                      )}>
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {task.description}
                        </p>
                      )}
                      
                      {/* Metadata */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Status */}
                        <Badge
                          variant="secondary"
                          className={cn('text-xs px-2 py-0.5', columnBadgeClass(resolvedCol, boardColumns))}
                        >
                          {columnLabel(resolvedCol, boardColumns)}
                        </Badge>

                        {/* Priority */}
                        <Badge 
                          variant="secondary" 
                          className={cn("text-xs px-2 py-0.5", priorityConfig[task.priority].color)}
                        >
                          {priorityConfig[task.priority].label}
                        </Badge>

                        {/* Customer */}
                        {task.customerName && (
                          <Badge 
                            variant="outline" 
                            className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/50 dark:text-purple-200 dark:border-purple-700"
                          >
                            {task.customerName}
                          </Badge>
                        )}

                        {/* Due date */}
                        {task.dueDate && (
                          <div className={cn(
                            "flex items-center gap-1 text-xs px-2 py-0.5 rounded-md",
                            isDueSoon 
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" 
                              : "bg-muted text-muted-foreground"
                          )}>
                            <Calendar className="h-3 w-3" />
                            <span>{getDueDateDisplay()}</span>
                          </div>
                        )}

                        {/* Attachments and Comments */}
                        {task.attachments.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="h-3 w-3" />
                            <span>{task.attachments.length}</span>
                          </div>
                        )}
                        {task.comments.length > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageCircle className="h-3 w-3" />
                            <span>{task.comments.length}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Assignee and Actions */}
                    <div className="flex items-center gap-2">
                      {assignee && (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={assignee.avatar} alt={assignee.name} />
                            <AvatarFallback className="text-xs">
                              {assignee.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      )}

                      {(canEditTask(task.createdBy, task.assigneeId) || canDeleteTask(task.createdBy)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          {canEditTask(task.createdBy, task.assigneeId) && (
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              openTaskEditor(task.id);
                            }}>
                              Edit action
                            </DropdownMenuItem>
                          )}
                          {canDeleteTask(task.createdBy) && (
                            <DropdownMenuItem 
                              className="text-red-600 focus:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteTask(task.id);
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {filteredTasks.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium text-foreground">No actions found</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {searchQuery || filterStatus !== 'all' || filterPriority !== 'all'
                ? 'Try adjusting your search or filters'
                : boardScope.type === 'project'
                  ? 'No actions in this process yet (or they are filtered out)'
                  : 'Create your first action to get started'}
            </p>
          </div>
        )}
      </div>

      <CreateProjectModal open={isCreateProjectOpen} onClose={() => setIsCreateProjectOpen(false)} />
      <EditGeneralBoardModal open={editGeneralOpen} onClose={() => setEditGeneralOpen(false)} />
      {editingProjectId && (
        <CreateProjectModal
          open={!!editingProjectId}
          onClose={() => setEditingProjectId(null)}
          mode="edit"
          projectId={editingProjectId}
        />
      )}
    </div>
  );
}