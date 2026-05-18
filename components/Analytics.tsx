'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { format, subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTaskContext } from '@/components/TaskContext';
import { Leaderboard } from '@/components/Leaderboard';
import { ExportModal } from '@/components/ExportModal';
import {
  resolveTaskBoardColumnId,
  isTerminalBoardColumn,
  FALLBACK_BOARD_COLUMNS,
  type Task,
  type ProjectColumnConfig,
} from '@/lib/types';
import {
  TrendingUp, Clock, Target, Users, CheckCircle2,
  AlertTriangle, Zap, Download, Layers, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Colour palettes ──────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#eab308',
  low:    '#22c55e',
};

const COL_COLORS = ['#6366f1', '#0ea5e9', '#8b5cf6', '#06b6d4', '#14b8a6', '#f59e0b'];
const TERMINAL_COLOR = '#22c55e';
const VELOCITY_COLOR = '#6366f1';

// ─── Sub-components ───────────────────────────────────────────────────────────

type Accent = 'blue' | 'emerald' | 'orange' | 'purple';

const ACCENT: Record<Accent, { card: string; label: string; value: string; sub: string }> = {
  blue:    { card: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',         label: 'text-blue-700 dark:text-blue-300',     value: 'text-blue-900 dark:text-blue-100',     sub: 'text-blue-600 dark:text-blue-400'    },
  emerald: { card: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800', label: 'text-emerald-700 dark:text-emerald-300', value: 'text-emerald-900 dark:text-emerald-100', sub: 'text-emerald-600 dark:text-emerald-400' },
  orange:  { card: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',   label: 'text-orange-700 dark:text-orange-300',  value: 'text-orange-900 dark:text-orange-100',  sub: 'text-orange-600 dark:text-orange-400'  },
  purple:  { card: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',   label: 'text-purple-700 dark:text-purple-300',  value: 'text-purple-900 dark:text-purple-100',  sub: 'text-purple-600 dark:text-purple-400'  },
};

function KpiCard({
  label, value, sub, icon, accent, progress,
}: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; accent: Accent; progress?: number;
}) {
  const s = ACCENT[accent];
  return (
    <Card className={cn('border', s.card)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn('text-xs font-medium', s.label)}>{label}</p>
            <p className={cn('mt-1 text-2xl font-bold tabular-nums', s.value)}>{value}</p>
          </div>
          {icon}
        </div>
        <p className={cn('mt-1 text-xs', s.sub)}>{sub}</p>
        {progress !== undefined && <Progress value={progress} className="mt-3 h-1.5" />}
      </CardContent>
    </Card>
  );
}

interface ColStat extends ProjectColumnConfig { count: number }

function ProcessCard({
  name, colStats, total, terminalCount, bottleneck, overdueCount,
}: {
  name: string;
  colStats: ColStat[];
  total: number;
  terminalCount: number;
  bottleneck: ColStat | null;
  overdueCount: number;
}) {
  const rate = total > 0 ? Math.round((terminalCount / total) * 100) : 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold">{name}</p>
          <Badge variant={rate >= 70 ? 'default' : 'secondary'} className="shrink-0 text-xs">
            {rate}% done
          </Badge>
        </div>

        {total === 0 ? (
          <p className="text-xs text-muted-foreground">No actions in this process yet.</p>
        ) : (
          <>
            {/* Segmented progress bar */}
            <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {colStats.map((col, i) => {
                if (col.count === 0) return null;
                return (
                  <div
                    key={col.id}
                    style={{
                      width: `${(col.count / total) * 100}%`,
                      background: col.isTerminal ? TERMINAL_COLOR : COL_COLORS[i % COL_COLORS.length],
                    }}
                    title={`${col.title}: ${col.count}`}
                  />
                );
              })}
            </div>

            {/* Column legend */}
            <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
              {colStats.map((col, i) => (
                <span key={col.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: col.isTerminal ? TERMINAL_COLOR : COL_COLORS[i % COL_COLORS.length] }}
                  />
                  {col.title}
                  <span className="font-medium text-foreground">{col.count}</span>
                </span>
              ))}
            </div>

            {/* Alert row */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>{total} total</span>
              {bottleneck && bottleneck.count >= 2 && (
                <span className="flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
                  <AlertCircle className="h-3 w-3" />
                  Bottleneck: {bottleneck.title} ({bottleneck.count})
                </span>
              )}
              {overdueCount > 0 && (
                <span className="flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  {overdueCount} overdue
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Analytics() {
  const { tasks, projects, currentTeam, generalBoardColumns } = useTaskContext();
  const [showExport, setShowExport] = useState(false);

  // ── Resolve column config for any task ─────────────────────────────────────
  const columnsForTask = useMemo(() => {
    const map = new Map<string, ProjectColumnConfig[]>(
      projects.map(p => [p.id, p.columnConfig.length > 0 ? p.columnConfig : FALLBACK_BOARD_COLUMNS])
    );
    const fallbackGeneral = generalBoardColumns.length > 0 ? generalBoardColumns : FALLBACK_BOARD_COLUMNS;
    return (task: Task): ProjectColumnConfig[] =>
      task.projectId ? (map.get(task.projectId) ?? FALLBACK_BOARD_COLUMNS) : fallbackGeneral;
  }, [projects, generalBoardColumns]);

  const isComplete = useMemo(
    () => (task: Task) => {
      const cols = columnsForTask(task);
      return isTerminalBoardColumn(resolveTaskBoardColumnId(task.status, cols), cols);
    },
    [columnsForTask]
  );

  // ── Base datasets ───────────────────────────────────────────────────────────
  const teamTasks     = useMemo(() => tasks.filter(t => t.teamId === currentTeam?.id), [tasks, currentTeam?.id]);
  const completedTasks = useMemo(() => teamTasks.filter(isComplete), [teamTasks, isComplete]);
  const pendingTasks   = useMemo(() => teamTasks.filter(t => !isComplete(t)), [teamTasks, isComplete]);
  const now            = useMemo(() => new Date(), []);

  const overdueTasks = useMemo(
    () => pendingTasks.filter(t => t.dueDate && t.dueDate < now),
    [pendingTasks, now]
  );

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const completionRate = teamTasks.length > 0
    ? Math.round((completedTasks.length / teamTasks.length) * 100)
    : 0;

  const velocityThisWeek = useMemo(() => {
    const weekAgo = subDays(now, 7);
    return completedTasks.filter(t => t.updatedAt >= weekAgo).length;
  }, [completedTasks, now]);

  const avgCompletionDays = useMemo(() => {
    const valid = completedTasks.filter(t => t.createdAt && t.updatedAt);
    if (!valid.length) return null;
    return valid.reduce(
      (s, t) => s + (t.updatedAt.getTime() - t.createdAt.getTime()) / 86_400_000,
      0
    ) / valid.length;
  }, [completedTasks]);

  // ── Velocity chart — last 12 weeks ──────────────────────────────────────────
  const velocityData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const weekEndBase = subDays(now, i * 7);
      const weekEnd = new Date(weekEndBase);
      weekEnd.setHours(23, 59, 59, 999);
      const weekStart = subDays(weekEnd, 6);
      weekStart.setHours(0, 0, 0, 0);
      const count = completedTasks.filter(
        t => t.updatedAt >= weekStart && t.updatedAt <= weekEnd
      ).length;
      return { week: format(weekStart, 'MMM d'), completed: count };
    }).reverse();
  }, [completedTasks, now]);

  // ── Priority distribution ───────────────────────────────────────────────────
  const priorityData = useMemo(() => {
    const counts: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0 };
    teamTasks.forEach(t => { if (t.priority in counts) counts[t.priority]++; });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: PRIORITY_COLORS[name] }));
  }, [teamTasks]);

  // ── Process breakdown ───────────────────────────────────────────────────────
  const processBreakdowns = useMemo(() => {
    const teamProjects = projects.filter(p => !p.teamId || p.teamId === currentTeam?.id);
    return teamProjects.map(project => {
      const cols: ProjectColumnConfig[] =
        project.columnConfig.length > 0 ? project.columnConfig : FALLBACK_BOARD_COLUMNS;
      const pt = teamTasks.filter(t => t.projectId === project.id);
      const colStats: ColStat[] = cols.map(col => ({
        ...col,
        count: pt.filter(t => resolveTaskBoardColumnId(t.status, cols) === col.id).length,
      }));
      const terminalCount = pt.filter(t =>
        isTerminalBoardColumn(resolveTaskBoardColumnId(t.status, cols), cols)
      ).length;
      const nonTerminalWithTasks = colStats.filter(c => !c.isTerminal && c.count > 0);
      const bottleneck = nonTerminalWithTasks.sort((a, b) => b.count - a.count)[0] ?? null;
      const overdueCount = pt.filter(
        t => t.dueDate && t.dueDate < now &&
          !isTerminalBoardColumn(resolveTaskBoardColumnId(t.status, cols), cols)
      ).length;
      return { project, colStats, total: pt.length, terminalCount, bottleneck, overdueCount };
    });
  }, [projects, teamTasks, currentTeam?.id, now]);

  // ── General board (tasks without a process) ─────────────────────────────────
  const generalBreakdown = useMemo(() => {
    const cols: ProjectColumnConfig[] =
      generalBoardColumns.length > 0 ? generalBoardColumns : FALLBACK_BOARD_COLUMNS;
    const gt = teamTasks.filter(t => !t.projectId);
    const colStats: ColStat[] = cols.map(col => ({
      ...col,
      count: gt.filter(t => resolveTaskBoardColumnId(t.status, cols) === col.id).length,
    }));
    const terminalCount = gt.filter(t =>
      isTerminalBoardColumn(resolveTaskBoardColumnId(t.status, cols), cols)
    ).length;
    return { colStats, total: gt.length, terminalCount };
  }, [teamTasks, generalBoardColumns]);

  // ── Team performance ────────────────────────────────────────────────────────
  const memberPerf = useMemo(() => {
    if (!currentTeam) return [];
    return currentTeam.members
      .map(m => {
        const mt = teamTasks.filter(t => t.assigneeId === m.id);
        const mc = mt.filter(isComplete);
        return { ...m, total: mt.length, completed: mc.length, rate: mt.length > 0 ? Math.round((mc.length / mt.length) * 100) : 0 };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [currentTeam, teamTasks, isComplete]);

  // ── Insights ────────────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    type Insight = { type: 'success' | 'warning' | 'info'; icon: string; title: string; body: string };
    const list: Insight[] = [];

    if (completionRate >= 80) {
      list.push({ type: 'success', icon: '🚀', title: 'Excellent progress', body: `${completionRate}% of all actions complete — team is firing on all cylinders.` });
    } else if (completionRate < 40 && teamTasks.length > 5) {
      list.push({ type: 'warning', icon: '⚠️', title: 'Low completion rate', body: `Only ${completionRate}% done. Review priorities and unblock stuck items.` });
    }

    if (overdueTasks.length > 0) {
      list.push({ type: 'warning', icon: '⏰', title: `${overdueTasks.length} overdue action${overdueTasks.length > 1 ? 's' : ''}`, body: 'These are past their due date and still open — address them first.' });
    }

    const stalledProcesses = processBreakdowns.filter(pb => pb.bottleneck && pb.bottleneck.count >= 3);
    if (stalledProcesses.length > 0) {
      const names = stalledProcesses.map(pb => `"${pb.project.name}"`).join(', ');
      list.push({ type: 'warning', icon: '🔴', title: 'Process bottleneck', body: `${names} — items piling up in one stage. Consider WIP limits or unblocking.` });
    }

    if (velocityThisWeek >= 5) {
      list.push({ type: 'success', icon: '⚡', title: 'High-velocity week', body: `${velocityThisWeek} actions closed this week. Momentum is strong.` });
    }

    const unassigned = pendingTasks.filter(t => !t.assigneeId).length;
    if (unassigned > 0) {
      list.push({ type: 'info', icon: '👥', title: `${unassigned} unassigned action${unassigned > 1 ? 's' : ''}`, body: 'Assign owners to improve accountability and velocity tracking.' });
    }

    if (avgCompletionDays !== null && avgCompletionDays <= 2) {
      list.push({ type: 'success', icon: '🎯', title: 'Fast turnaround', body: `Average ${avgCompletionDays.toFixed(1)} days per action — excellent execution speed.` });
    } else if (avgCompletionDays !== null && avgCompletionDays > 10) {
      list.push({ type: 'info', icon: '📊', title: 'Long completion cycles', body: `Actions take ~${Math.round(avgCompletionDays)} days on average. Break them into smaller steps.` });
    }

    if (list.length === 0) {
      list.push({ type: 'info', icon: '💡', title: 'Getting started', body: 'Complete actions to unlock personalised insights about your team\'s performance.' });
    }

    return list.slice(0, 4);
  }, [completionRate, overdueTasks.length, processBreakdowns, velocityThisWeek, pendingTasks, avgCompletionDays, teamTasks.length]);

  const showProcessSection =
    processBreakdowns.some(pb => pb.total > 0) || generalBreakdown.total > 0;

  const tooltipStyle = {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentTeam?.name ?? 'Team'} · {teamTasks.length} total actions
          </p>
        </div>
        <Button onClick={() => setShowExport(true)} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Completion rate"
          value={`${completionRate}%`}
          sub={`${completedTasks.length} / ${teamTasks.length} actions`}
          icon={<Target className="h-5 w-5 text-blue-500" />}
          accent="blue"
          progress={completionRate}
        />
        <KpiCard
          label="This week"
          value={String(velocityThisWeek)}
          sub="actions completed"
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          accent="emerald"
        />
        <KpiCard
          label="Overdue"
          value={String(overdueTasks.length)}
          sub={overdueTasks.length === 0 ? 'All on track' : 'past due date'}
          icon={<AlertTriangle className="h-5 w-5 text-orange-500" />}
          accent={overdueTasks.length > 0 ? 'orange' : 'emerald'}
        />
        <KpiCard
          label="Avg. completion"
          value={avgCompletionDays !== null ? `${avgCompletionDays.toFixed(1)}d` : '—'}
          sub="per action"
          icon={<Clock className="h-5 w-5 text-purple-500" />}
          accent="purple"
        />
      </div>

      {/* ── Velocity + Priority ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Velocity area chart (2/3) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4" />
              Completion velocity — last 12 weeks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={velocityData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={VELOCITY_COLOR} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={VELOCITY_COLOR} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06} />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600 }} />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke={VELOCITY_COLOR}
                  strokeWidth={2}
                  fill="url(#vGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority donut (1/3) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4" />
              Priority mix
            </CardTitle>
          </CardHeader>
          <CardContent>
            {priorityData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={priorityData}
                      cx="50%" cy="50%"
                      innerRadius={44} outerRadius={68}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {priorityData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number, name: string) => [`${v} actions`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                  {priorityData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                      <span className="capitalize">{d.name}</span>
                      <span className="ml-auto font-medium text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Process breakdown ── */}
      {showProcessSection && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">Process breakdown</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {generalBreakdown.total > 0 && (
              <ProcessCard
                name="General board"
                colStats={generalBreakdown.colStats}
                total={generalBreakdown.total}
                terminalCount={generalBreakdown.terminalCount}
                bottleneck={null}
                overdueCount={0}
              />
            )}
            {processBreakdowns.map(pb => (
              <ProcessCard
                key={pb.project.id}
                name={pb.project.name}
                colStats={pb.colStats}
                total={pb.total}
                terminalCount={pb.terminalCount}
                bottleneck={pb.bottleneck}
                overdueCount={pb.overdueCount}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Team performance + Insights ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" />
              Team performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {memberPerf.length === 0 ? (
              <p className="text-sm text-muted-foreground">No team members yet.</p>
            ) : (
              memberPerf.map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={m.avatar} alt={m.name} />
                    <AvatarFallback className="text-xs">{m.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="truncate text-sm font-medium">{m.name}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {m.completed}/{m.total}
                      </span>
                    </div>
                    <Progress value={m.rate} className="h-1.5" />
                  </div>
                  <Badge variant={m.rate >= 70 ? 'default' : 'secondary'} className="w-12 justify-center text-xs">
                    {m.rate}%
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:border-emerald-800/40 dark:from-emerald-900/20 dark:to-emerald-900/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              <Zap className="h-4 w-4" />
              Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-white/60 p-3 dark:bg-black/20">
                <span className={cn(
                  'mt-0.5 h-2 w-2 shrink-0 rounded-full',
                  ins.type === 'success' && 'bg-emerald-500',
                  ins.type === 'warning' && 'bg-orange-500',
                  ins.type === 'info'    && 'bg-blue-500',
                )} />
                <div>
                  <p className="text-sm font-medium">{ins.icon} {ins.title}</p>
                  <p className="text-xs text-muted-foreground">{ins.body}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Leaderboard ── */}
      <Leaderboard />

      {/* ── Export ── */}
      <ExportModal open={showExport} onClose={() => setShowExport(false)} />
    </div>
  );
}
