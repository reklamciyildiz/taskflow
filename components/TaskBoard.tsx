'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { TaskCard } from '@/components/TaskCard';
import { useTaskContext, type TaskStatus } from '@/components/TaskContext';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Layers, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { VoiceToTaskButton } from '@/components/ai/VoiceToTaskButton';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isToday } from 'date-fns';
import { isTerminalBoardColumn } from '@/lib/types';
import { orderedColumnTasks, computeBoardDropPatches } from '@/lib/board-reorder';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { EditGeneralBoardModal } from '@/components/EditGeneralBoardModal';

export function TaskBoard() {
  const [isMobileBoard, setIsMobileBoard] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobileBoard(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const {
    tasks,
    filter,
    setFilter,
    currentUser,
    currentTeam,
    boardScope,
    boardProject,
    boardColumns,
    projects,
    setBoardScope,
    permissions,
    canCompleteTask,
    canEditTask,
    customers,
    customerFilter,
    setCustomerFilter,
    customerDirectoryLabel,
    customerSingularLabel,
    openTaskEditor,
    currentUserRole,
    applyTaskUpdates,
  } = useTaskContext();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editGeneralOpen, setEditGeneralOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | null>(null);
  const DESKTOP_SCROLL_THRESHOLD = 4;

  const projectsForTeam = useMemo(() => {
    if (!currentTeam) return projects;
    return projects.filter((p) => !p.teamId || p.teamId === currentTeam.id);
  }, [projects, currentTeam?.id]);

  const handleCreateTask = () => {
    setIsCreateModalOpen(true);
  };

  // Apply quick filters from sidebar
  const filteredTasks = useMemo(() => {
    let result = tasks.filter((task) => task.teamId === currentTeam?.id);

    if (boardScope.type === 'general') {
      result = result.filter((task) => task.projectId == null);
    } else {
      result = result.filter((task) => task.projectId === boardScope.projectId);
    }
    
    // Apply quick filter from sidebar
    if (filter === 'dueToday') {
      result = result.filter(task => task.dueDate && isToday(task.dueDate) && task.status !== 'done');
    } else if (filter === 'highPriority') {
      result = result.filter(task => (task.priority === 'high' || task.priority === 'urgent') && task.status !== 'done');
    } else if (filter === 'assignedToMe') {
      result = result.filter(task => task.assigneeId === currentUser?.id && task.status !== 'done');
    }
    
    // Apply customer filter
    if (customerFilter) {
      result = result.filter(task => task.customerId === customerFilter);
    }
    
    // Apply status filter
    if (statusFilter) {
      result = result.filter(task => task.status === statusFilter);
    }
    
    return result;
  }, [tasks, statusFilter, filter, customerFilter, currentUser?.id, currentTeam?.id, boardScope]);

  const onDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) return;
      if (destination.droppableId === source.droppableId && destination.index === source.index) return;

      const task = filteredTasks.find((t) => t.id === draggableId);
      if (!task) return;

      if (!canEditTask(task.createdBy, task.assigneeId)) return;

      if (destination.droppableId !== source.droppableId) {
        if (isTerminalBoardColumn(destination.droppableId, boardColumns)) {
          if (!canCompleteTask(task.assigneeId)) return;
        }
      }

      const patches = computeBoardDropPatches(filteredTasks, boardColumns, result);
      if (!patches?.length) return;

      void applyTaskUpdates(patches);
    },
    [filteredTasks, boardColumns, canEditTask, canCompleteTask, applyTaskUpdates]
  );

  const getFilterLabel = () => {
    if (filter === 'dueToday') return 'Due Today';
    if (filter === 'highPriority') return 'High Priority';
    if (filter === 'assignedToMe') return 'Assigned to Me';
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold">Pano</h2>
          {projectsForTeam.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Select
                value={boardScope.type === 'general' ? '__general__' : boardScope.projectId}
                onValueChange={(v) => {
                  if (v === '__general__') setBoardScope({ type: 'general' });
                  else setBoardScope({ type: 'project', projectId: v });
                }}
              >
                <SelectTrigger
                  className="h-10 w-full sm:w-auto sm:min-w-[200px]"
                  aria-label="Active process / project"
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
                    title={boardScope.type === 'general' ? 'Edit general columns' : 'Edit selected process'}
                    aria-label={boardScope.type === 'general' ? 'Edit general columns' : 'Edit selected process'}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}
          {filter && (
            <Badge variant="secondary" className="flex items-center gap-1 px-3 py-1">
              {getFilterLabel()}
              <button onClick={() => setFilter(null)} className="ml-1 hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {customerFilter && (
            <Badge variant="outline" className="flex items-center gap-1 px-3 py-1 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
              {customers.find(c => c.id === customerFilter)?.name || 'Customer'}
              <button onClick={() => setCustomerFilter(null)} className="ml-1 hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {customers.length > 0 && (
            <Select
              value={customerFilter ?? '__all_customers__'}
              onValueChange={(v) =>
                setCustomerFilter(v === '__all_customers__' ? null : v)
              }
            >
              <SelectTrigger
                className="h-10 w-full min-w-[180px] sm:w-auto"
                aria-label={`Filter by ${customerSingularLabel.toLowerCase()}`}
              >
                <SelectValue placeholder={`All ${customerDirectoryLabel}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all_customers__">All {customerDirectoryLabel}</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {permissions.canCreateTask && (
            <>
              <VoiceToTaskButton 
                onTaskCreated={(task) => {
                  // Open create modal with pre-filled data from AI
                  setIsCreateModalOpen(true);
                  // You can pass the AI-generated data to the modal if needed
                }}
              />
              <Button onClick={handleCreateTask}>
                <Plus className="mr-2 h-4 w-4" />
                Yeni aksiyon
              </Button>
            </>
          )}
        </div>
      </div>
      
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 overscroll-x-contain [scrollbar-width:thin]">
        <Button 
          variant={!statusFilter ? 'default' : 'outline'}
          onClick={() => setStatusFilter(null)}
          size="sm"
          className="shrink-0"
        >
          All
        </Button>
        {boardColumns.map((column) => (
          <Button 
            key={column.id}
            variant={statusFilter === column.id ? 'default' : 'outline'}
            onClick={() => setStatusFilter(column.id)}
            size="sm"
            className="shrink-0"
          >
            {column.title}
          </Button>
        ))}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <>
          {/* Mobile: horizontal scroll across all columns (snap); drag between columns is unreliable on touch — use ⋮ → Change status */}
          <div className="md:hidden">
            <p className="mb-2 px-0.5 text-xs text-muted-foreground">
              Swipe horizontally between columns. On mobile, move a card between columns from the ⋮ menu using
              <span className="font-medium text-foreground"> Change status</span> (drag & drop is disabled to
              avoid scroll/drag conflicts).
            </p>
            <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 pt-0.5 overscroll-x-contain [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
              {boardColumns.map((column) => {
                const columnTasks = orderedColumnTasks(filteredTasks, column.id, boardColumns);
                return (
                  <div
                    key={column.id}
                    className="w-[min(88vw,300px)] max-w-[min(88vw,300px)] shrink-0 snap-center snap-always flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="min-w-0 truncate font-medium">{column.title}</h3>
                      <Badge variant="secondary" className="shrink-0">
                        {columnTasks.length}
                      </Badge>
                    </div>
                    <Droppable droppableId={column.id}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            'max-h-[min(58dvh,520px)] min-h-[200px] overflow-y-auto rounded-lg p-3 transition-colors touch-pan-y',
                            column.color ?? 'bg-muted/40'
                          )}
                        >
                          {columnTasks.map((task, index) => (
                            <Draggable
                              key={task.id}
                              draggableId={task.id}
                              index={index}
                              isDragDisabled={isMobileBoard}
                            >
                              {(provided) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className="mb-2"
                                >
                                  <TaskCard
                                    task={task}
                                    dragHandleProps={isMobileBoard ? undefined : provided.dragHandleProps}
                                    onTaskClick={(t) => openTaskEditor(t.id)}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop: grid columns */}
          <div
            className="hidden md:grid gap-4"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            }}
          >
            {boardColumns.map((column) => {
              const columnTasks = orderedColumnTasks(filteredTasks, column.id, boardColumns);
              const shouldScroll = columnTasks.length >= DESKTOP_SCROLL_THRESHOLD;

              return (
                <div key={column.id} className="flex min-h-0 flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{column.title}</h3>
                    <Badge variant="secondary">{columnTasks.length}</Badge>
                  </div>
                  <Droppable droppableId={column.id}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          'p-4 rounded-lg min-h-[200px] transition-colors',
                          shouldScroll && 'max-h-[min(72dvh,680px)] overflow-y-auto',
                          column.color ?? 'bg-muted/40'
                        )}
                      >
                        {columnTasks.map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className="mb-2"
                              >
                                <TaskCard
                                  task={task}
                                  dragHandleProps={provided.dragHandleProps}
                                  onTaskClick={(t) => openTaskEditor(t.id)}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </>
      </DragDropContext>

      <CreateTaskModal 
        open={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />
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