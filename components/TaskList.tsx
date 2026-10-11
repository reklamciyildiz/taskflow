'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarDays,
  CheckCircle2,
  Columns3,
  Filter,
  Layers,
  MoreHorizontal,
  RotateCcw,
  Search,
  Settings2,
} from 'lucide-react';
import { useTaskContext, type Task, type TaskPriority } from '@/components/TaskContext';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { WorkSchedulePicker } from '@/components/schedule/WorkSchedulePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProcessProperties } from '@/hooks/useProcessProperties';
import { PROPERTY_COLOR_CLASSES, type ProcessProperty } from '@/lib/process-properties';
import {
  filterAndSortOperationalTasks,
  hasOperationalFilters,
  propertyValuesByTask,
  UNASSIGNED_FILTER,
  type OperationalSort,
  type OperationalSortField,
  type OperationalTableFilters,
} from '@/lib/operational-table';
import { isTerminalBoardColumn } from '@/lib/types';
import { resolveStageLifecycle } from '@/lib/stage-lifecycle';
import type { ProjectColumnConfig } from '@/lib/types';
import { scheduleChipLabel } from '@/lib/schedule-presentation';
import { cn } from '@/lib/utils';

const ALL = '__all__';
const NATIVE_COLUMNS = ['stage', 'priority', 'assignee', 'schedule', 'client'] as const;
type NativeColumn = typeof NATIVE_COLUMNS[number];
type ColumnId = NativeColumn | `property:${string}`;

const priorityConfig: Record<TaskPriority, { label: string }> = {
  low: { label: 'Low' },
  medium: { label: 'Medium' },
  high: { label: 'High' },
  urgent: { label: 'Urgent' },
};

const emptyFilters = (): OperationalTableFilters => ({
  stage: null,
  priority: null,
  assignee: null,
  properties: {},
});

function tablePreferenceKey(organizationId: string | null, userId: string | undefined, teamId: string | undefined, processId: string | null) {
  if (!organizationId || !userId || !teamId) return '';
  return `axiom:operational-table:${organizationId}:${userId}:${teamId}:${processId ?? 'general'}`;
}

function InlineSelect({
  value,
  disabled,
  label,
  onValueChange,
  children,
}: {
  value: string;
  disabled?: boolean;
  label: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label} className="h-11 min-w-0 md:h-8 md:min-w-[128px] border-transparent bg-transparent px-2 text-xs hover:border-border/70 hover:bg-muted/40 disabled:opacity-100 disabled:text-muted-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function CompletionControl({ task, columns, disabled, onChange }: {
  task: Task; columns: ProjectColumnConfig[]; disabled: boolean; onChange: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const lifecycle = resolveStageLifecycle(task.status, columns);
  const targets = columns.filter(column => isTerminalBoardColumn(column.id, columns) !== lifecycle.isTerminal);
  const recurring = task.schedule?.scheduleType === 'recurring';
  const unavailable = disabled || !lifecycle.resolved || !targets.length || recurring;
  const label = recurring ? `Complete occurrences of ${task.title} in Planner`
    : !targets.length ? `No ${lifecycle.isTerminal ? 'open' : 'terminal'} stage configured for ${task.title}`
      : `Mark ${task.title} ${lifecycle.isTerminal ? 'open' : 'complete'}`;
  return <Popover open={open} onOpenChange={next => setOpen(next && !unavailable && targets.length > 1)}>
    <label className="flex h-11 w-11 items-center justify-center md:h-8 md:w-6" title={label}>
      <PopoverTrigger asChild>
        <Checkbox className="h-6 w-6 md:h-4 md:w-4" checked={lifecycle.isTerminal} disabled={unavailable}
          aria-label={label} title={label} onCheckedChange={() => {
            if (targets.length === 1) onChange(targets[0].id); else setOpen(true);
          }} />
      </PopoverTrigger>
    </label>
    <PopoverContent align="start" className="w-64 p-2">
      <p className="px-2 py-1 text-xs text-muted-foreground">Choose {lifecycle.isTerminal ? 'an open' : 'a terminal'} stage</p>
      {targets.map(stage => <button key={stage.id} type="button" className="block min-h-[44px] w-full rounded px-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { onChange(stage.id); setOpen(false); }}>{stage.title}</button>)}
    </PopoverContent>
  </Popover>;
}

function ScheduleCell({ task, disabled }: { task: Task; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Schedule for ${task.title}`}
          className="inline-flex h-11 md:h-8 max-w-full md:max-w-[170px] items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:cursor-default"
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{task.schedule ? scheduleChipLabel(task.schedule) : 'Unscheduled'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,380px)] border-0 bg-transparent p-0 shadow-none">
        <WorkSchedulePicker
          source={{ sourceType: 'action', taskId: task.id }}
          initialSchedule={task.schedule ?? null}
          disabled={disabled}
          onRequestClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export function TaskList() {
  const {
    tasks,
    currentTeam,
    currentUser,
    organizationId,
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
    loading,
  } = useTaskContext();
  const processId = boardScope.type === 'project' ? boardScope.projectId : null;
  const properties = useProcessProperties(processId, currentTeam?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<OperationalTableFilters>(emptyFilters);
  const [sort, setSort] = useState<OperationalSort>({ field: 'schedule', direction: 'asc' });
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>([...NATIVE_COLUMNS]);
  const [pendingFields, setPendingFields] = useState<Set<string>>(() => new Set());
  const pendingRef = useRef(new Set<string>());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const projectsForTeam = useMemo(() => {
    if (!currentTeam) return projects;
    return projects.filter((project) => !project.teamId || project.teamId === currentTeam.id);
  }, [projects, currentTeam]);
  const activeProperties = useMemo(
    () => properties.data?.properties.filter((property) => !property.archived_at) ?? [],
    [properties.data?.properties],
  );
  const propertySignature = activeProperties.map((property) => property.id).join(',');
  const preferenceKey = tablePreferenceKey(organizationId, currentUser?.id, currentTeam?.id, processId);

  useEffect(() => {
    setSearchQuery('');
    setFilters(emptyFilters());
    setSort({ field: 'schedule', direction: 'asc' });
    setExpandedRows(new Set());
  }, [processId, currentTeam?.id]);

  useEffect(() => {
    const available = new Set<ColumnId>([
      ...NATIVE_COLUMNS,
      ...activeProperties.map((property) => `property:${property.id}` as const),
    ]);
    let next: ColumnId[] = [...available];
    if (preferenceKey) {
      try {
        const stored = window.localStorage.getItem(preferenceKey);
        if (stored) {
          const parsed = JSON.parse(stored) as unknown;
          if (Array.isArray(parsed)) next = parsed.filter((value): value is ColumnId => typeof value === 'string' && available.has(value as ColumnId));
        }
      } catch {
        // A corrupt local preference must not block the table.
      }
    }
    setVisibleColumns(next);
  }, [preferenceKey, propertySignature, activeProperties]);

  useEffect(() => {
    setFilters((current) => {
      if (!current.stage || boardColumns.some((column) => column.id === current.stage)) return current;
      return { ...current, stage: null };
    });
  }, [boardColumns]);

  const scopedTasks = useMemo(() => tasks.filter((task) => {
    if (task.teamId !== currentTeam?.id) return false;
    return boardScope.type === 'general' ? task.projectId == null : task.projectId === boardScope.projectId;
  }), [tasks, currentTeam?.id, boardScope]);
  const selections = useMemo(
    () => propertyValuesByTask(properties.data?.values ?? []),
    [properties.data?.values],
  );
  const stageLabels = useMemo(() => new Map(boardColumns.map((column) => [column.id, column.title])), [boardColumns]);
  const assigneeLabels = useMemo(
    () => new Map((currentTeam?.members ?? []).map((member) => [member.id, member.name])),
    [currentTeam?.members],
  );
  const filteredTasks = useMemo(() => filterAndSortOperationalTasks({
    tasks: scopedTasks,
    search: searchQuery,
    filters,
    sort,
    values: properties.data?.values ?? [],
    options: properties.data?.options ?? [],
    stageLabels,
    assigneeLabels,
  }), [scopedTasks, searchQuery, filters, sort, properties.data?.values, properties.data?.options, stageLabels, assigneeLabels]);

  const persistVisibleColumns = (next: ColumnId[]) => {
    setVisibleColumns(next);
    if (!preferenceKey) return;
    try { window.localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch { /* local preferences are best effort */ }
  };
  const toggleColumn = (id: ColumnId, checked: boolean) => {
    persistVisibleColumns(checked
      ? [...visibleColumns, id].filter((value, index, all) => all.indexOf(value) === index)
      : visibleColumns.filter((column) => column !== id));
  };

  const mutateTaskField = async (task: Task, field: string, changes: Parameters<typeof updateTask>[1]) => {
    const key = `${task.id}:${field}`;
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);
    setPendingFields((current) => new Set(current).add(key));
    try {
      const ok = await updateTask(task.id, changes);
      if (!ok) toast.error('Action could not be updated. Your previous value was restored.');
    } finally {
      pendingRef.current.delete(key);
      setPendingFields((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };
  const isPending = (taskId: string, field: string) => pendingFields.has(`${taskId}:${field}`);

  const setPropertyFilter = (propertyId: string, value: string) => {
    setFilters((current) => {
      const next = { ...current.properties };
      if (value === ALL) delete next[propertyId]; else next[propertyId] = value;
      return { ...current, properties: next };
    });
  };
  const propertyForColumn = (column: ColumnId): ProcessProperty | undefined =>
    column.startsWith('property:')
      ? activeProperties.find((property) => property.id === column.slice('property:'.length))
      : undefined;
  const setSortField = (field: string) => setSort((current) => ({ ...current, field: field as OperationalSortField }));

  const headerLabel = (column: ColumnId) => {
    if (column === 'stage') return 'Stage';
    if (column === 'priority') return 'Priority';
    if (column === 'assignee') return 'Assignee';
    if (column === 'schedule') return 'Schedule';
    if (column === 'client') return 'Client';
    return propertyForColumn(column)?.name ?? 'Property';
  };

  return (
    <div className="h-full min-w-0 max-w-full space-y-3 md:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Action table</h1>
          <p className="mt-1 hidden md:block text-sm text-muted-foreground">
            {boardProject ? `${boardProject.name} · edit operational metadata inline` : 'General Actions'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {projectsForTeam.length > 0 && (
            <Select value={processId ?? ''} onValueChange={(projectId) => setBoardScope({ type: 'project', projectId })}>
              <SelectTrigger aria-label="Table process" className="h-9 w-full min-w-[210px] sm:w-auto"><SelectValue placeholder="Choose process" /></SelectTrigger>
              <SelectContent>{projectsForTeam.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {currentUserRole === 'admin' && (
            <>
              <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setIsCreateProjectOpen(true)}><Layers className="h-4 w-4" />New process</Button>
              <Button variant="outline" size="icon" className="h-9 w-9" disabled={!boardProject} onClick={() => setEditingProjectId(boardProject?.id ?? null)} aria-label="Edit selected process"><Settings2 className="h-4 w-4" /></Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/40 p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search actions and property values" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search actions and property values…" className="h-11 md:h-9 pl-9" />
          </div>
          <Button variant="ghost" className="h-11 md:hidden" aria-expanded={showFilters} aria-controls="table-filters" onClick={() => setShowFilters(value => !value)}><Filter className="mr-2 h-4 w-4" />Filters{hasOperationalFilters(filters) ? ' (active)' : ''}</Button>
          <div id="table-filters" className={cn('flex-wrap items-center gap-2 md:flex max-md:[&_button]:min-h-[44px]', showFilters ? 'flex' : 'hidden')}>
            <span className="inline-flex h-8 items-center gap-1.5 text-xs font-medium text-muted-foreground"><Filter className="h-3.5 w-3.5" />Filters</span>
            <Select value={filters.stage ?? ALL} onValueChange={(value) => setFilters((current) => ({ ...current, stage: value === ALL ? null : value }))}>
              <SelectTrigger aria-label="Filter by stage" className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All stages</SelectItem>{boardColumns.map((column) => <SelectItem key={column.id} value={column.id}>{column.title}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filters.priority ?? ALL} onValueChange={(value) => setFilters((current) => ({ ...current, priority: value === ALL ? null : value as TaskPriority }))}>
              <SelectTrigger aria-label="Filter by priority" className="h-8 w-[138px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All priorities</SelectItem>{Object.entries(priorityConfig).map(([value, config]) => <SelectItem key={value} value={value}>{config.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filters.assignee ?? ALL} onValueChange={(value) => setFilters((current) => ({ ...current, assignee: value === ALL ? null : value }))}>
              <SelectTrigger aria-label="Filter by assignee" className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ALL}>All assignees</SelectItem><SelectItem value={UNASSIGNED_FILTER}>Unassigned</SelectItem>{currentTeam?.members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</SelectContent>
            </Select>
            {activeProperties.map((property) => (
              <Select key={property.id} value={filters.properties[property.id] ?? ALL} onValueChange={(value) => setPropertyFilter(property.id, value)}>
                <SelectTrigger aria-label={`Filter by ${property.name}`} className="h-8 w-[150px] text-xs"><SelectValue placeholder={property.name} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All {property.name}</SelectItem>
                  <SelectItem value={UNASSIGNED_FILTER}>Unassigned</SelectItem>
                  {properties.data?.options.filter((option) => option.property_id === property.id && !option.archived_at).map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ))}
            {(hasOperationalFilters(filters) || searchQuery) && <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { setFilters(emptyFilters()); setSearchQuery(''); }}><RotateCcw className="h-3.5 w-3.5" />Clear</Button>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
          <p className="text-xs text-muted-foreground">{filteredTasks.length} of {scopedTasks.length} Actions</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2 max-md:[&_button]:min-h-[44px]">
            <Select value={sort.field} onValueChange={setSortField}>
              <SelectTrigger aria-label="Sort table" className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="title">Sort by title</SelectItem><SelectItem value="stage">Sort by stage</SelectItem><SelectItem value="priority">Sort by priority</SelectItem><SelectItem value="assignee">Sort by assignee</SelectItem><SelectItem value="schedule">Sort by schedule</SelectItem><SelectItem value="client">Sort by client</SelectItem><SelectItem value="created">Sort by created</SelectItem>
                {activeProperties.map((property) => <SelectItem key={property.id} value={`property:${property.id}`}>Sort by {property.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setSort((current) => ({ ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' }))} aria-label={`Sort ${sort.direction === 'asc' ? 'descending' : 'ascending'}`}>
              {sort.direction === 'asc' ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"><Columns3 className="h-3.5 w-3.5" />Columns</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked disabled>Action</DropdownMenuCheckboxItem>
                {NATIVE_COLUMNS.map((column) => <DropdownMenuCheckboxItem key={column} checked={visibleColumns.includes(column)} onCheckedChange={(checked) => toggleColumn(column, checked === true)}>{headerLabel(column)}</DropdownMenuCheckboxItem>)}
                {activeProperties.length > 0 && <DropdownMenuSeparator />}
                {activeProperties.map((property) => {
                  const column = `property:${property.id}` as const;
                  return <DropdownMenuCheckboxItem key={property.id} checked={visibleColumns.includes(column)} onCheckedChange={(checked) => toggleColumn(column, checked === true)}>{property.name}</DropdownMenuCheckboxItem>;
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {properties.error && <p className="mt-2 text-xs text-destructive">Properties could not be loaded. <button className="underline" onClick={() => void properties.reload()}>Retry</button></p>}
      </div>

      <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border/60 bg-card/30 shadow-sm">
        <Table className="block md:table md:min-w-[760px]">
          <TableHeader className="hidden md:table-header-group bg-muted/30">
            <TableRow className="hover:bg-muted/30">
              <TableHead className="w-10 px-3" />
              <TableHead className="min-w-[240px] px-3">Action</TableHead>
              {visibleColumns.map((column) => <TableHead key={column} className="min-w-[150px] px-3 text-xs uppercase tracking-wide">{headerLabel(column)}</TableHead>)}
              <TableHead className="w-10 px-2" />
            </TableRow>
          </TableHeader>
          <TableBody className="block md:table-row-group">
            {filteredTasks.map((task) => {
              const canEdit = canEditTask(task.createdBy, task.assigneeId);
              const terminal = isTerminalBoardColumn(task.status, boardColumns);
              const taskSelections = selections.get(task.id);
              return (
                <TableRow key={task.id} className="group relative grid grid-cols-2 gap-x-1 p-2 md:table-row md:p-0">
                  <TableCell className="absolute left-2 top-2 flex h-11 w-9 items-center justify-center p-0 md:static md:table-cell md:h-auto md:w-auto md:px-3 md:py-2">
                    <CompletionControl task={task} columns={boardColumns} disabled={!canCompleteTask(task.assigneeId) || isPending(task.id, 'status')} onChange={status => void mutateTaskField(task, 'status', { status })} />
                  </TableCell>
                  <TableCell className="col-span-2 min-w-0 py-2 pl-10 pr-11 md:px-3">
                    <button type="button" className={cn('min-h-[28px] w-full break-words text-left text-sm font-medium line-clamp-3 hover:text-primary hover:underline md:line-clamp-none md:max-w-[360px] md:truncate', terminal && 'line-through text-muted-foreground')} onClick={() => openTaskEditor(task.id)} title={task.title}>{task.title}</button>
                  </TableCell>
                  {visibleColumns.map((column) => {
                    const cellClass = cn('min-w-0 px-2 py-1 md:table-cell md:py-1.5 before:block before:text-[10px] before:text-muted-foreground before:content-[attr(data-label)] md:before:hidden',
                      ['stage', 'priority', 'schedule'].includes(column) ? 'block' : 'col-span-2',
                      !['stage', 'priority', 'schedule'].includes(column) && !expandedRows.has(task.id) ? 'hidden' : 'block');
                    if (column === 'stage') return <TableCell key={column} data-label={headerLabel(column)} className={cellClass}><InlineSelect label={`Stage for ${task.title}`} value={task.status} disabled={!canEdit || isPending(task.id, 'status')} onValueChange={(status) => void mutateTaskField(task, 'status', { status })}>{!boardColumns.some((stage) => stage.id === task.status) && <SelectItem value={task.status}>Unresolved ({task.status})</SelectItem>}{boardColumns.map((stage) => <SelectItem key={stage.id} value={stage.id} disabled={isTerminalBoardColumn(stage.id, boardColumns) && !canCompleteTask(task.assigneeId)}>{stage.title}</SelectItem>)}</InlineSelect></TableCell>;
                    if (column === 'priority') return <TableCell key={column} data-label={headerLabel(column)} className={cellClass}><InlineSelect label={`Priority for ${task.title}`} value={task.priority} disabled={!canEdit || isPending(task.id, 'priority')} onValueChange={(priority) => void mutateTaskField(task, 'priority', { priority: priority as TaskPriority })}>{Object.entries(priorityConfig).map(([value, config]) => <SelectItem key={value} value={value}>{config.label}</SelectItem>)}</InlineSelect></TableCell>;
                    if (column === 'assignee') return <TableCell key={column} data-label={headerLabel(column)} className={cellClass}><InlineSelect label={`Assignee for ${task.title}`} value={task.assigneeId ?? UNASSIGNED_FILTER} disabled={!canEdit || isPending(task.id, 'assignee')} onValueChange={(assigneeId) => void mutateTaskField(task, 'assignee', { assigneeId: assigneeId === UNASSIGNED_FILTER ? null : assigneeId })}><SelectItem value={UNASSIGNED_FILTER}>Unassigned</SelectItem>{currentTeam?.members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}</InlineSelect></TableCell>;
                    if (column === 'schedule') return <TableCell key={column} data-label={headerLabel(column)} className={cellClass}><ScheduleCell task={task} disabled={!canEdit} /></TableCell>;
                    if (column === 'client') return <TableCell key={column} data-label={headerLabel(column)} className={cn(cellClass, "text-xs text-muted-foreground break-words")}>{task.customerName ?? '—'}</TableCell>;
                    const property = propertyForColumn(column);
                    if (!property) return null;
                    const selected = taskSelections?.get(property.id) ?? UNASSIGNED_FILTER;
                    const options = properties.data?.options.filter((option) => option.property_id === property.id && (!option.archived_at || option.id === selected)) ?? [];
                    return <TableCell key={column} data-label={headerLabel(column)} className={cellClass}><InlineSelect label={`${property.name} for ${task.title}`} value={selected} disabled={!canEdit || properties.isValuePending(task.id, property.id)} onValueChange={(optionId) => { void properties.setValue(task.id, property.id, optionId === UNASSIGNED_FILTER ? null : optionId).catch((error) => toast.error(error instanceof Error ? error.message : 'Property could not be updated')); }}><SelectItem value={UNASSIGNED_FILTER}>Unassigned</SelectItem>{options.map((option) => <SelectItem key={option.id} value={option.id} disabled={!!option.archived_at}><span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${PROPERTY_COLOR_CLASSES[option.color]}`} />{option.label}{option.archived_at ? ' (archived)' : ''}</span></SelectItem>)}</InlineSelect></TableCell>;
                  })}
                  <TableCell className="absolute right-2 top-2 p-0 md:static md:px-2 md:py-1.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 md:h-8 md:w-8 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" aria-label={`Actions for ${task.title}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => openTaskEditor(task.id)}>Open Action</DropdownMenuItem>{canDeleteTask(task.createdBy) && <DropdownMenuItem className="text-destructive" onSelect={() => void deleteTask(task.id)}>Delete</DropdownMenuItem>}</DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  {visibleColumns.some(column => !['stage', 'priority', 'schedule'].includes(column)) && <TableCell className="self-end p-0 md:hidden">
                    <button type="button" className="min-h-[44px] w-full rounded px-2 text-left text-xs text-muted-foreground hover:bg-muted" aria-expanded={expandedRows.has(task.id)} aria-label={`More details for ${task.title}`} onClick={() => setExpandedRows(current => { const next = new Set(current); if (next.has(task.id)) next.delete(task.id); else next.add(task.id); return next; })}>{expandedRows.has(task.id) ? 'Less details' : 'More details'}</button>
                  </TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filteredTasks.length === 0 && (
          <div className="px-6 py-14 text-center">
            {loading ? <p className="animate-pulse text-sm text-muted-foreground">Loading actions…</p> : <><CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" /><h3 className="text-sm font-medium">No actions found</h3><p className="mt-1 text-xs text-muted-foreground">{searchQuery || hasOperationalFilters(filters) ? 'Try adjusting your search or filters.' : 'This process has no Actions yet.'}</p></>}
          </div>
        )}
      </div>

      <CreateProjectModal open={isCreateProjectOpen} onClose={() => setIsCreateProjectOpen(false)} />
      {editingProjectId && <CreateProjectModal open onClose={() => setEditingProjectId(null)} mode="edit" projectId={editingProjectId} />}
    </div>
  );
}
