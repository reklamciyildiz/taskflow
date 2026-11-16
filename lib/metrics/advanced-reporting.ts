import {
  FALLBACK_BOARD_COLUMNS,
  isTerminalBoardColumn,
  type Project,
  type ProjectColumnConfig,
  type Task,
} from '@/lib/types';
import { completionDurationDays, verifiedCompletionAt } from '@/lib/metrics/completions';

export type ReportWindowDays = 7 | 30 | 90;
export type ReportProcessFilter = 'all' | 'general' | string;
export type ReportAssigneeFilter = 'all' | 'unassigned' | string;

export interface ReportingInput {
  tasks: readonly Task[];
  projects: readonly Project[];
  generalColumns: readonly ProjectColumnConfig[];
  teamId: string | null;
  processId: ReportProcessFilter;
  assigneeId: ReportAssigneeFilter;
  days: ReportWindowDays;
  now: Date;
}

export type ReportSummary = {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  dueSoon: number;
  unassigned: number;
  stale: number;
  createdInPeriod: number;
  completedInPeriod: number;
  completionRate: number;
  averageCompletionDays: number | null;
  verifiedDurationSample: number;
  missingCompletionDates: number;
  unresolvedStages: number;
};

export interface ReportingBucket {
  start: Date;
  end: Date;
  created: number;
  completed: number;
}

export interface ReportProcessRow {
  id: string;
  name: string;
  total: number;
  open: number;
  completed: number;
  overdue: number;
  stale: number;
  completedInPeriod: number;
  completionRate: number;
}

export interface ReportActionRisk {
  id: string;
  title: string;
  projectId: string | null;
  assigneeId: string | null | undefined;
  dueDate: Date | null;
  overdueDays: number;
  staleDays: number;
}

export interface AdvancedReport {
  windowStart: Date;
  windowEnd: Date;
  days: ReportWindowDays;
  summary: ReportSummary;
  buckets: ReportingBucket[];
  processRows: ReportProcessRow[];
  atRisk: ReportActionRisk[];
}

const MS_PER_DAY = 86_400_000;
const isDate = (date: unknown): date is Date =>
  date instanceof Date && Number.isFinite(date.getTime());

/** Local calendar-day arithmetic: a date-only deadline must not become overdue at 00:01. */
export function startOfLocalDay(date: Date): Date {
  const day = new Date(date.getTime());
  day.setHours(0, 0, 0, 0);
  return day;
}
function shiftLocalDay(date: Date, amount: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}
function dayOrdinal(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

function makeSummary(total: number): ReportSummary {
  return {
    total, open: 0, completed: 0, overdue: 0, dueSoon: 0,
    unassigned: 0, stale: 0, createdInPeriod: 0, completedInPeriod: 0,
    completionRate: 0, averageCompletionDays: null, verifiedDurationSample: 0,
    missingCompletionDates: 0, unresolvedStages: 0,
  };
}

/**
 * Read-only reporting over the *already authorized* team/Process projection.
 * Never invent historical stage snapshots from current statuses. Time charts
 * use verified task.createdAt / task.completedAt only; deleted tasks and past
 * reopened transitions are not present in this projection.
 */
export function buildAdvancedReport(input: ReportingInput): AdvancedReport {
  const { tasks, projects, generalColumns, teamId, processId, assigneeId, days, now } = input;
  const asOf = isDate(now) ? new Date(now.getTime()) : new Date(0);
  const today = startOfLocalDay(asOf);
  const windowStart = shiftLocalDay(today, -(days - 1));
  const processMap = new Map(
    projects.filter(p => p.teamId === teamId || p.teamId === null).map(p => [p.id, p]),
  );
  const inboxColumns: ProjectColumnConfig[] = generalColumns.length ? [...generalColumns] : FALLBACK_BOARD_COLUMNS;
  const scoped = tasks.filter(task =>
    !!teamId && task.teamId === teamId
    // A missing or inaccessible Process must never appear in reports/exports.
    && (!task.projectId || processMap.has(task.projectId))
    && (processId === 'all' || (processId === 'general' ? !task.projectId : task.projectId === processId))
    && (assigneeId === 'all'
      || (assigneeId === 'unassigned' ? !task.assigneeId : task.assigneeId === assigneeId))
  );

  const columns = (task: Task) =>
    task.projectId ? (processMap.get(task.projectId)?.columnConfig ?? []) : inboxColumns;
  const stageKnown = (task: Task) => columns(task).some(column => column.id === task.status);
  const complete = (task: Task) =>
    stageKnown(task) && isTerminalBoardColumn(task.status, columns(task));
  const completion = (task: Task) => complete(task) ? verifiedCompletionAt(task) : null;
  const dueOrdinal = (task: Task) => isDate(task.dueDate) ? dayOrdinal(task.dueDate) : null;
  const todayOrdinal = dayOrdinal(today);
  const tomorrowWeekEnd = todayOrdinal + 6;
  const staleCutoff = shiftLocalDay(today, -14);
  const summary = makeSummary(scoped.length);
  const durations: number[] = [];
  const risks: ReportActionRisk[] = [];
  const processGroups = new Map<string, Task[]>();

  for (const task of scoped) {
    const id = task.projectId ?? 'general';
    const group = processGroups.get(id) ?? [];
    group.push(task);
    processGroups.set(id, group);

    if (!stageKnown(task)) summary.unresolvedStages++;
    if (isDate(task.createdAt) && task.createdAt >= windowStart && task.createdAt <= asOf) {
      summary.createdInPeriod++;
    }
    const done = complete(task);
    const verified = completion(task);
    if (done) {
      summary.completed++;
      if (!verified) summary.missingCompletionDates++;
      if (verified && verified >= windowStart && verified <= asOf) {
        summary.completedInPeriod++;
        const duration = completionDurationDays(task);
        if (duration !== null) durations.push(duration);
      }
      continue;
    }

    summary.open++;
    if (!task.assigneeId) summary.unassigned++;
    const due = dueOrdinal(task);
    const overdue = due !== null && due < todayOrdinal;
    const dueSoon = due !== null && due >= todayOrdinal && due <= tomorrowWeekEnd;
    const stale = isDate(task.updatedAt) && task.updatedAt < staleCutoff;
    if (overdue) summary.overdue++;
    if (dueSoon) summary.dueSoon++;
    if (stale) summary.stale++;

    if (overdue || stale) {
      risks.push({
        id: task.id, title: task.title, projectId: task.projectId ?? null,
        assigneeId: task.assigneeId, dueDate: isDate(task.dueDate) ? task.dueDate : null,
        overdueDays: overdue && due !== null ? todayOrdinal - due : 0,
        staleDays: stale ? Math.max(14, Math.floor((asOf.getTime() - task.updatedAt.getTime()) / MS_PER_DAY)) : 0,
      });
    }
  }
  summary.completionRate = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0;
  summary.verifiedDurationSample = durations.length;
  summary.averageCompletionDays = durations.length
    ? durations.reduce((sum, days) => sum + days, 0) / durations.length : null;

  const groupSize = days === 90 ? 7 : 1;
  const buckets: ReportingBucket[] = [];
  for (let offset = 0; offset < days; offset += groupSize) {
    const start = shiftLocalDay(windowStart, offset);
    const end = shiftLocalDay(start, Math.min(groupSize, days - offset));
    buckets.push({ start, end, created: 0, completed: 0 });
  }
  for (const task of scoped) {
    const occurred = (at: Date | null, key: 'created' | 'completed') => {
      if (!at || at < windowStart || at > asOf) return;
      const dayIndex = dayOrdinal(at) - dayOrdinal(windowStart);
      if (dayIndex < 0 || dayIndex >= days) return;
      const bucket = buckets[Math.floor(dayIndex / groupSize)];
      if (bucket) bucket[key]++;
    };
    occurred(isDate(task.createdAt) ? task.createdAt : null, 'created');
    occurred(completion(task), 'completed');
  }

  const processRows = Array.from(processGroups.entries()).map(([id, group]): ReportProcessRow => {
    const completed = group.filter(complete).length;
    const open = group.length - completed;
    return {
      id,
      name: id === 'general' ? 'Inbox' : processMap.get(id)?.name ?? 'Process',
      total: group.length, open, completed,
      overdue: group.filter(t => !complete(t) && (dueOrdinal(t) ?? Infinity) < todayOrdinal).length,
      stale: group.filter(t => !complete(t) && isDate(t.updatedAt) && t.updatedAt < staleCutoff).length,
      completedInPeriod: group.filter(t => {
        const date = completion(t);
        return date !== null && date >= windowStart && date <= asOf;
      }).length,
      completionRate: group.length ? Math.round(completed * 100 / group.length) : 0,
    };
  }).sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));

  risks.sort((a, b) =>
    b.overdueDays - a.overdueDays || b.staleDays - a.staleDays || a.title.localeCompare(b.title));

  return { windowStart, windowEnd: asOf, days, summary, buckets, processRows, atRisk: risks.slice(0, 10) };
}
