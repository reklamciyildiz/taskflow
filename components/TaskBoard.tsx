'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { TaskCard } from '@/components/TaskCard';
import { useTaskContext, type TaskStatus } from '@/components/TaskContext';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Layers, Settings2, Columns3, LayoutDashboard, ListChecks, CircleCheck, SlidersHorizontal, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CreateTaskModal } from '@/components/CreateTaskModal';
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
import { InboxStageRecoveryDialog } from '@/components/InboxStageRecoveryDialog';
import { useProcessProperties } from '@/hooks/useProcessProperties';
import { PropertyBoard } from '@/components/PropertyBoard';
import { PROPERTY_COLOR_CLASSES, selectedPropertyOptionsForTask, groupActionsByProperty } from '@/lib/process-properties';
import { ProcessSwitcher } from '@/components/ProcessSwitcher';
import { useUserPreferences } from '@/components/UserPreferencesContext';
import { reconcileProcessOrder } from '@/lib/user-preferences';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STAGE_SKINS = [
  { panel: 'border-sky-500/15 bg-sky-500/[0.035]', dot: 'bg-sky-400', text: 'text-sky-500' },
  { panel: 'border-violet-500/15 bg-violet-500/[0.035]', dot: 'bg-violet-400', text: 'text-violet-500' },
  { panel: 'border-amber-500/15 bg-amber-500/[0.035]', dot: 'bg-amber-400', text: 'text-amber-500' },
  { panel: 'border-teal-500/15 bg-teal-500/[0.035]', dot: 'bg-teal-400', text: 'text-teal-500' },
  { panel: 'border-rose-500/15 bg-rose-500/[0.035]', dot: 'bg-rose-400', text: 'text-rose-500' },
] as const;

export function TaskBoard() {
  const preferences = useUserPreferences();
  const processOrderSyncAttemptRef = useRef('');
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
    organizationId,
    boardScope,
    boardProject,
    boardColumns,
    inboxBoardStatus,
    inboxCanInitialize,
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
    loading,
  } = useTaskContext();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editGeneralOpen, setEditGeneralOpen] = useState(false);
  const [assigningStageFor, setAssigningStageFor] = useState<string | null>(null);
  const [inboxRecoveryOpen, setInboxRecoveryOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | null>(null);
  const [groupBy, setGroupBy] = useState('stage');
  const [mobileGroupId, setMobileGroupId] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [cardPropertyIds, setCardPropertyIds] = useState<string[]>([]);
  const processId = boardScope.type === 'project' ? boardScope.projectId : null;
  const properties = useProcessProperties(processId, currentTeam?.id);
  const groupedProperty = properties.data?.properties.find(p => p.id === groupBy && !p.archived_at);
  const activeProperties = useMemo(
    () => properties.data?.properties.filter(property => !property.archived_at) ?? [],
    [properties.data?.properties],
  );
  const cardFieldsKey = organizationId && currentUser?.id && currentTeam?.id && processId
    ? `axiom:board-card-properties:${organizationId}:${currentUser.id}:${currentTeam.id}:${processId}`
    : '';
  useEffect(() => { setGroupBy('stage'); setStatusFilter(null); setMobileGroupId(null); }, [processId, currentTeam?.id]);
  useEffect(() => { setMobileGroupId(null); }, [groupBy]);
  useEffect(() => {
    if (properties.data && groupBy !== 'stage' && !groupedProperty) setGroupBy('stage');
  }, [properties.data, groupBy, groupedProperty]);
  useEffect(() => {
    if (!cardFieldsKey) { setCardPropertyIds([]); return; }
    const available = new Set(activeProperties.map(property => property.id));
    try {
      const stored = window.localStorage.getItem(cardFieldsKey);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) {
          setCardPropertyIds(parsed.filter((id): id is string => typeof id === 'string' && available.has(id)).slice(0, 2));
          return;
        }
      }
    } catch {
      // Fall through to a useful process-local default.
    }
    setCardPropertyIds(activeProperties.slice(0, 2).map(property => property.id));
  }, [cardFieldsKey, activeProperties]);
  const setCardFieldVisible = (propertyId: string, visible: boolean) => {
    const next = visible
      ? [...cardPropertyIds, propertyId].filter((id, index, all) => all.indexOf(id) === index).slice(0, 2)
      : cardPropertyIds.filter(id => id !== propertyId);
    setCardPropertyIds(next);
    if (cardFieldsKey) {
      try { window.localStorage.setItem(cardFieldsKey, JSON.stringify(next)); } catch { /* preferences are best effort */ }
    }
  };
  const propertyBadgesForTask = useCallback((taskId: string) => {
    if (!properties.data) return [];
    return selectedPropertyOptionsForTask(taskId, cardPropertyIds, properties.data).map(({ property, option }) => ({
      id: property.id,
      label: `${property.name}: ${option.label}`,
      colorClass: PROPERTY_COLOR_CLASSES[option.color],
    }));
  }, [properties.data, cardPropertyIds]);
  const DESKTOP_SCROLL_THRESHOLD = 4;

  const projectsForTeam = useMemo(() => {
    if (!currentTeam) return projects;
    return projects.filter((p) => !p.teamId || p.teamId === currentTeam.id);
  }, [projects, currentTeam]);
  const orderedProjectsForTeam = useMemo(
    () => reconcileProcessOrder(
      projectsForTeam,
      currentTeam ? preferences.processOrderByTeam[currentTeam.id] : undefined,
    ),
    [currentTeam, preferences.processOrderByTeam, projectsForTeam],
  );
  useEffect(() => {
    if (!currentTeam || loading || preferences.loading) return;
    const stored = preferences.processOrderByTeam[currentTeam.id] ?? [];
    const canonical = orderedProjectsForTeam.map((project) => project.id);
    if (stored.length === canonical.length && stored.every((id, index) => id === canonical[index])) return;
    const signature = `${currentTeam.id}:${canonical.join(',')}`;
    if (processOrderSyncAttemptRef.current === signature) return;
    processOrderSyncAttemptRef.current = signature;
    // Persist newly visible processes at the end and remove inaccessible/deleted IDs.
    void preferences.setProcessOrder(currentTeam.id, canonical);
  }, [currentTeam, loading, orderedProjectsForTeam, preferences]);
  const hasProcesses = projectsForTeam.length > 0;

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
      result = result.filter(
        task => task.dueDate && isToday(task.dueDate) && !isTerminalBoardColumn(task.status, boardColumns),
      );
    } else if (filter === 'highPriority') {
      result = result.filter(task => (task.priority === 'high' || task.priority === 'urgent') && !isTerminalBoardColumn(task.status, boardColumns));
    } else if (filter === 'assignedToMe') {
      result = result.filter(task => task.assigneeId === currentUser?.id && !isTerminalBoardColumn(task.status, boardColumns));
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
  }, [tasks, statusFilter, filter, customerFilter, currentUser?.id, currentTeam?.id, boardScope, boardColumns]);

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

      void applyTaskUpdates(patches).then(ok => { if (!ok) toast.error('Some moves could not be saved. Failed changes were restored.'); });
    },
    [filteredTasks, boardColumns, canEditTask, canCompleteTask, applyTaskUpdates]
  );

  const getFilterLabel = () => {
    if (filter === 'dueToday') return 'Due Today';
    if (filter === 'highPriority') return 'High Priority';
    if (filter === 'assignedToMe') return 'Assigned to Me';
    return null;
  };

  // Preserve unresolved persisted statuses. Never silently map historical values
  // onto a stage by position, label, or terminal semantics.
  const unresolvedTasks = useMemo(
    () => filteredTasks.filter((task) => !boardColumns.some((column) => column.id === task.status)),
    [filteredTasks, boardColumns],
  );

  const assignUnresolvedStage = useCallback(async (taskId: string, stageId: string) => {
    const task = unresolvedTasks.find((item) => item.id === taskId);
    const stage = boardColumns.find((column) => column.id === stageId);
    if (!task || !stage || assigningStageFor) return;
    // General stage definitions are currently localStorage-only in the web
    // product. Mobile cannot verify that a missing status is really orphaned.
    // Fail closed rather than corrupt a valid cross-device stage assignment.
    if (boardScope.type === 'general') {
      toast.error('General stages differ between devices. Reconcile stage definitions on web first.');
      return;
    }
    if (!canEditTask(task.createdBy, task.assigneeId)) {
      toast.error('You cannot edit this Action.');
      return;
    }
    if (stage.isTerminal && !canCompleteTask(task.assigneeId)) {
      toast.error('You cannot complete this Action.');
      return;
    }
    setAssigningStageFor(taskId);
    try {
      const saved = await applyTaskUpdates([{ id: taskId, changes: { status: stageId } }]);
      if (!saved) toast.error('Stage was not saved. No change was applied.');
      else toast.success('Action stage updated.');
    } catch {
      toast.error('Could not save the stage. Try again.');
    } finally {
      setAssigningStageFor(null);
    }
  }, [unresolvedTasks, boardColumns, boardScope.type, assigningStageFor, canEditTask, canCompleteTask, applyTaskUpdates]);

  const mobileGroups = groupedProperty && properties.data
    ? groupActionsByProperty(filteredTasks, groupedProperty, properties.data.options, properties.data.values)
    : boardColumns.filter(column => !statusFilter || column.id === statusFilter).map(column => ({
      id: column.id, label: column.title, tasks: orderedColumnTasks(filteredTasks, column.id, boardColumns),
    }));
  const mobileGroup = mobileGroups.find(group => group.id === mobileGroupId) ?? mobileGroups[0];
  const completedCount = filteredTasks.filter(task => isTerminalBoardColumn(task.status, boardColumns)).length;
  const progressPercent = filteredTasks.length ? Math.round((completedCount / filteredTasks.length) * 100) : 0;
  const boardTitle = boardScope.type === 'project' ? boardProject?.name ?? 'Selected process' : 'Team inbox';

  return (
    <div className="min-w-0 max-w-full space-y-5 pb-4 md:space-y-6">
      <header className="relative isolate overflow-hidden rounded-[26px] border border-border/70 bg-gradient-to-br from-card via-card to-primary/[0.055] shadow-[0_20px_65px_-46px_rgba(15,23,42,0.5)]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-primary/[0.07] blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-10 h-px w-1/3 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="relative space-y-5 p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-muted-foreground">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                  <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
                </span>
                Workspace <span className="text-border">/</span> Projects &amp; Board
              </p>
              <h1 className="max-w-3xl break-words text-[25px] font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-[30px]">
                {boardTitle}
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                Organize work, follow progress, and move Actions through your workflow.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5 lg:min-w-[350px]">
              <div className="rounded-2xl border border-border/65 bg-background/65 px-3 py-3.5 shadow-sm">
                <div className="mb-2 flex items-center gap-1.5 text-muted-foreground"><ListChecks className="h-3.5 w-3.5" aria-hidden /><span className="text-[10px] font-medium">Actions</span></div>
                <p className="text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{filteredTasks.length}</p>
              </div>
              <div className="rounded-2xl border border-border/65 bg-background/65 px-3 py-3.5 shadow-sm">
                <div className="mb-2 flex items-center gap-1.5 text-muted-foreground"><Layers className="h-3.5 w-3.5" aria-hidden /><span className="text-[10px] font-medium">Stages</span></div>
                <p className="text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{boardColumns.length}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.055] px-3 py-3.5 shadow-sm">
                <div className="mb-2 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><CircleCheck className="h-3.5 w-3.5" aria-hidden /><span className="text-[10px] font-medium">Complete</span></div>
                <p className="text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">{progressPercent}<span className="ml-0.5 text-xs font-medium text-muted-foreground">%</span></p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/60 pt-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Active process</p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <ProcessSwitcher
                  projects={orderedProjectsForTeam}
                  value={boardScope.type === 'project' ? boardScope.projectId : ''}
                  onValueChange={(projectId) => setBoardScope(projectId ? { type: 'project', projectId } : { type: 'general' })}
                  onReorder={(projectIds) => {
                    if (currentTeam) void preferences.setProcessOrder(currentTeam.id, projectIds);
                  }}
                />
                {currentUserRole === 'admin' && (
                  <>
                    <Button type="button" variant="outline" size="sm"
                      className="h-11 gap-2 rounded-xl border-border/70 bg-background/70 px-3 text-xs font-semibold shadow-sm hover:border-primary/35 hover:bg-primary/[0.065]"
                      onClick={() => setIsCreateProjectOpen(true)} title="Create a new process (project)">
                      <Layers className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">New process</span>
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-xl border-border/70 bg-background/70 shadow-sm hover:border-primary/35"
                      onClick={() => setEditingProjectId(boardProject?.id ?? null)} disabled={!boardProject}
                      title="Edit selected process" aria-label="Edit selected process">
                      <Settings2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {customers.length > 0 && (
                <Select value={customerFilter ?? '__all_customers__'}
                  onValueChange={(value) => setCustomerFilter(value === '__all_customers__' ? null : value)}>
                  <SelectTrigger className="h-11 min-w-[160px] flex-1 rounded-xl border-border/70 bg-background/70 shadow-sm sm:w-auto sm:flex-none"
                    aria-label={`Filter by ${customerSingularLabel.toLowerCase()}`}>
                    <SelectValue placeholder={`All ${customerDirectoryLabel}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all_customers__">All {customerDirectoryLabel}</SelectItem>
                    {customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {permissions.canCreateTask && (
                <Button className="h-11 flex-1 gap-2 rounded-xl px-5 font-semibold shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.75)] transition-[box-shadow,background-color] hover:shadow-[0_10px_28px_-10px_hsl(var(--primary)/0.7)] sm:flex-none"
                  onClick={handleCreateTask}>
                  <Plus className="h-4 w-4" aria-hidden /> New Action <ArrowUpRight className="ml-1 h-3.5 w-3.5 opacity-70" aria-hidden />
                </Button>
              )}
            </div>
          </div>

          {(filter || customerFilter) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
              <span className="text-[11px] font-medium text-muted-foreground">Active filters</span>
              {filter && (
                <Badge variant="secondary" className="flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.07] px-2.5 py-1 text-[11px]">
                  {getFilterLabel()}
                  <button type="button" aria-label="Clear quick filter" onClick={() => setFilter(null)}
                    className="rounded-full p-0.5 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              )}
              {customerFilter && (
                <Badge variant="outline" className="flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/[0.055] px-2.5 py-1 text-[11px] text-foreground">
                  {customers.find(c => c.id === customerFilter)?.name || 'Customer'}
                  <button type="button" aria-label="Clear client filter" onClick={() => setCustomerFilter(null)}
                    className="rounded-full p-0.5 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </div>
      </header>

      {/* First-run empty state: no processes yet */}
      {loading ? (
        <div className="space-y-3 rounded-[24px] border border-border/65 bg-card/70 p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground animate-pulse">Loading processes...</p>
        </div>
      ) : !hasProcesses && boardScope.type !== 'general' ? (
        <div className="space-y-3 rounded-[24px] border border-dashed border-border/75 bg-card/75 p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">No processes yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first process, then select it on the board to link actions to that flow.
          </p>
          {currentUserRole === 'admin' ? (
            <Button variant="outline" onClick={() => setIsCreateProjectOpen(true)} className="gap-2">
              <Layers className="h-4 w-4" />
              New process
            </Button>
          ) : (
            <Badge variant="outline" className="mx-auto h-9 px-3 text-xs text-muted-foreground">
              Only team admins can create processes
            </Badge>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-[20px] border border-border/70 bg-card/75 p-2.5 shadow-[0_14px_35px_-28px_rgba(15,23,42,0.45)] md:p-3.5">
            <Button variant="ghost" className="h-11 w-full justify-between rounded-xl bg-muted/45 px-3 text-xs font-medium md:hidden" aria-expanded={showControls} aria-controls="board-controls" onClick={() => setShowControls(value => !value)}><span>Group by {groupedProperty?.name ?? 'Stage'}{statusFilter ? ' · filtered' : ''}</span><Settings2 className="h-4 w-4" /></Button>
            <div id="board-controls" className={cn('flex-col gap-3 md:flex xl:flex-row xl:items-center xl:justify-between max-md:[&_button]:min-h-[44px]', showControls ? 'flex' : 'hidden')}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Group by</span>
                <Select value={groupedProperty ? groupBy : 'stage'} onValueChange={setGroupBy} disabled={!processId || properties.loading || !!properties.error}>
                  <SelectTrigger aria-label="Group board by" className="h-10 w-44 rounded-xl border-border/70 bg-background/70 text-xs shadow-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="stage">Stage</SelectItem>
                    {activeProperties.map(property => <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {activeProperties.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-10 gap-1.5 rounded-xl border-border/70 bg-background/70 px-3 text-xs shadow-sm"><Columns3 className="h-3.5 w-3.5" />Card fields</Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuLabel>Show up to 2 properties</DropdownMenuLabel>
                      {activeProperties.map(property => {
                        const checked = cardPropertyIds.includes(property.id);
                        return <DropdownMenuCheckboxItem key={property.id} checked={checked} disabled={!checked && cardPropertyIds.length >= 2} onCheckedChange={value => setCardFieldVisible(property.id, value === true)}>{property.name}</DropdownMenuCheckboxItem>;
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {properties.error && <button type="button" className="text-xs text-destructive underline" onClick={() => void properties.reload()}>Properties unavailable · Retry</button>}
              </div>
              {isMobileBoard ? <Select value={statusFilter ?? '__all__'} onValueChange={value => setStatusFilter(value === '__all__' ? null : value)}>
                <SelectTrigger aria-label="Filter by stage" className="h-11 rounded-xl border-border/70 bg-background/70"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__all__">All stages</SelectItem>{boardColumns.map(column => <SelectItem key={column.id} value={column.id}>{column.title}</SelectItem>)}</SelectContent>
              </Select> : <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin] xl:pb-0">
                <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Stages</span>
                <Button variant={!statusFilter ? 'default' : 'outline'} onClick={() => setStatusFilter(null)} size="sm" className="h-9 shrink-0 rounded-full px-3.5 text-xs font-medium">All</Button>
                {boardColumns.map((column) => <Button key={column.id} variant={statusFilter === column.id ? 'default' : 'outline'} onClick={() => setStatusFilter(column.id)} size="sm" className="h-9 shrink-0 rounded-full border-border/65 bg-background/50 px-3.5 text-xs font-medium data-[state=active]:bg-primary">{column.title}</Button>)}
              </div>}
            </div>
          </div>
      
          {boardScope.type === 'general' && inboxBoardStatus === 'unconfigured' && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3 text-sm" aria-label="Inbox synchronization">
              <div className="min-w-0 flex-1">
                <p className="font-medium">Inbox stages are not yet synchronized</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Existing Action stages remain unchanged. Review saved stage IDs before sharing these stages across web and Android.
                  {tasks.filter(task => task.teamId === currentTeam?.id && task.projectId == null && !boardColumns.some(stage => stage.id === task.status)).length > 0
                    ? ' Some saved stage IDs need recovery.' : ''}
                </p>
              </div>
              {inboxCanInitialize && currentUserRole === 'admin'
                ? <Button type="button" variant="outline" onClick={() => setInboxRecoveryOpen(true)}>Review &amp; sync stages</Button>
                : <span className="text-xs text-muted-foreground">Ask a team administrator to synchronize stages.</span>}
            </section>
          )}
          {boardScope.type === 'general' && inboxBoardStatus !== 'unconfigured' && unresolvedTasks.length > 0 && (
            <details className="rounded-lg border border-amber-500/35 p-3 text-sm" aria-label="Actions with unmatched stage IDs">
              <summary className="cursor-pointer font-medium">{unresolvedTasks.length} Inbox Actions have unrecognized stage IDs</summary>
              <p className="my-2 text-xs leading-5 text-muted-foreground">
                No Actions were moved or deleted. Review the saved stage IDs on the original browser before making changes.
              </p>
              {unresolvedTasks.map(task => (
                <button type="button" key={task.id} className="block py-1 text-left underline-offset-2 hover:underline" onClick={() => openTaskEditor(task.id)}>{task.title}</button>
              ))}
            </details>
          )}
          {boardScope.type === 'project' && unresolvedTasks.length > 0 && (
            <section className="mb-4 space-y-3 rounded-lg border border-amber-500/30 p-3 text-sm" aria-label="Process Actions needing stage assignment">
              <h3 className="font-medium">Needs stage assignment ({unresolvedTasks.length})</h3>
              <p className="text-xs text-muted-foreground">These Actions reference a missing Process stage. Saved Actions have not been moved.</p>
              <div className="space-y-2">
                {unresolvedTasks.map(task => {
                  const editable = canEditTask(task.createdBy, task.assigneeId);
                  return (
                    <div key={task.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/50 bg-card/70 p-2.5 sm:flex-row sm:items-center">
                      <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => openTaskEditor(task.id)}>{task.title}</button>
                      <Select value={undefined} disabled={!editable || assigningStageFor !== null}
                        onValueChange={stageId => void assignUnresolvedStage(task.id, stageId)}>
                        <SelectTrigger aria-label={`Assign a stage to ${task.title}`} className="h-11 w-full shrink-0 sm:w-44">
                          <SelectValue placeholder={assigningStageFor === task.id ? 'Saving...' : editable ? 'Assign stage' : 'Read-only'} />
                        </SelectTrigger>
                        <SelectContent>
                          {boardColumns.filter(stage => !stage.isTerminal || canCompleteTask(task.assigneeId))
                            .map(stage => <SelectItem key={stage.id} value={stage.id}>{stage.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {isMobileBoard ? <section className="min-w-0 space-y-3" aria-label="Board actions">
            {mobileGroup && <>
              <Select value={mobileGroup.id} onValueChange={setMobileGroupId}>
                <SelectTrigger aria-label="Active board group" className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{mobileGroups.map(group => <SelectItem key={group.id} value={group.id}>{group.label} ({group.tasks.length})</SelectItem>)}</SelectContent>
              </Select>
              <div className="space-y-2" aria-label={mobileGroup.label}>
                {mobileGroup.tasks.map(task => <TaskCard key={task.id} task={task} onTaskClick={item => openTaskEditor(item.id)} propertyBadges={propertyBadgesForTask(task.id)} />)}
                {!mobileGroup.tasks.length && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No Actions in this group.</p>}
              </div>
            </>}
          </section> : groupedProperty && properties.data ? (
            <PropertyBoard tasks={filteredTasks} property={groupedProperty} data={properties.data} onOpen={openTaskEditor} cardPropertyIds={cardPropertyIds} />
          ) : <DragDropContext onDragEnd={onDragEnd}>
            <>
              {/* Responsive Board Container */}
              <div
                className="flex -mx-1 snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-3 pt-0.5 overscroll-x-contain [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] md:grid md:gap-4 md:snap-none md:overflow-visible md:mx-0 md:px-0 md:pb-0 md:pt-0"
                style={{
                  gridTemplateColumns: isMobileBoard ? undefined : 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                }}
              >
                {boardColumns.map((column) => {
                  const columnTasks = orderedColumnTasks(filteredTasks, column.id, boardColumns);
                  const shouldScroll = columnTasks.length >= DESKTOP_SCROLL_THRESHOLD;

                  return (
                    <div
                      key={column.id}
                      className="w-[min(88vw,300px)] max-w-[min(88vw,300px)] shrink-0 snap-center snap-always flex flex-col gap-2 md:w-auto md:max-w-none md:shrink md:snap-align-none md:min-h-0"
                    >
                      <div className="flex items-center justify-between gap-2 md:gap-0">
                        <h3 className="min-w-0 truncate font-medium md:min-w-auto">{column.title}</h3>
                        <Badge variant="secondary" className="shrink-0">{columnTasks.length}</Badge>
                      </div>
                      <Droppable droppableId={column.id}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={cn(
                              'max-h-[min(58dvh,520px)] min-h-[200px] overflow-y-auto rounded-lg p-3 transition-colors touch-pan-y md:p-4 md:max-h-none',
                              shouldScroll && 'md:max-h-[min(72dvh,680px)]',
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
                                      propertyBadges={propertyBadgesForTask(task.id)}
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
          </DragDropContext>}
        </>
      )}

      <CreateTaskModal 
        open={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)}
      />
      <CreateProjectModal open={isCreateProjectOpen} onClose={() => setIsCreateProjectOpen(false)} />
      <EditGeneralBoardModal open={editGeneralOpen} onClose={() => setEditGeneralOpen(false)} />
      <InboxStageRecoveryDialog open={inboxRecoveryOpen} onClose={() => setInboxRecoveryOpen(false)} />
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
