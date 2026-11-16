'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowUpRight, CalendarClock, ChartNoAxesCombined,
  CheckCheck, Clock3, Download, Info, Layers3, ListTodo, RefreshCw,
  ShieldCheck, Users,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { useAppLocale } from '@/components/i18n/AppLocaleProvider';
import { useTaskContext } from '@/components/TaskContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { buildAdvancedReport, type ReportWindowDays } from '@/lib/metrics/advanced-reporting';
import { buildAdvancedReportCsv } from '@/lib/metrics/advanced-report-csv';

type Tone = 'neutral' | 'good' | 'warning';
function Metric({
  label, value, detail, icon, tone = 'neutral',
}: {
  label: string; value: string; detail: string; icon: ReactNode; tone?: Tone;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[18px] border border-border/65 bg-card/80 p-4 shadow-[0_10px_30px_-26px_rgba(0,0,0,0.35)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border',
          tone === 'good' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
          tone === 'warning' && 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
          tone === 'neutral' && 'border-primary/15 bg-primary/[0.07] text-primary',
        )}>{icon}</span>
      </div>
      <p className="mt-2 text-[clamp(1.35rem,2.5vw,1.8rem)] font-bold tracking-[-0.04em] tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

export function AdvancedReports() {
  const { t, date, number } = useAppLocale();
  const {
    tasks, projects, currentTeam, generalBoardColumns, openTaskEditor, loading,
  } = useTaskContext();
  const [days, setDays] = useState<ReportWindowDays>(30);
  const [processId, setProcessId] = useState('all');
  const [assigneeId, setAssigneeId] = useState('all');
  const [asOf, setAsOf] = useState(() => new Date());

  useEffect(() => {
    setProcessId('all');
    setAssigneeId('all');
  }, [currentTeam?.id]);

  useEffect(() => {
    const refreshTime = () => {
      if (document.visibilityState === 'visible') setAsOf(new Date());
    };
    document.addEventListener('visibilitychange', refreshTime);
    window.addEventListener('focus', refreshTime);
    return () => {
      document.removeEventListener('visibilitychange', refreshTime);
      window.removeEventListener('focus', refreshTime);
    };
  }, []);

  const visibleProjects = useMemo(
    () => projects.filter(project => project.teamId === currentTeam?.id || project.teamId === null),
    [projects, currentTeam?.id],
  );
  const projectIds = useMemo(() => new Set(visibleProjects.map(project => project.id)), [visibleProjects]);
  const effectiveProcess = processId === 'all' || processId === 'general' || projectIds.has(processId)
    ? processId : 'all';
  const memberIds = useMemo(
    () => new Set((currentTeam?.members ?? []).map(member => member.id)),
    [currentTeam?.members],
  );
  const effectiveAssignee = assigneeId === 'all' || assigneeId === 'unassigned' || memberIds.has(assigneeId)
    ? assigneeId : 'all';
  const report = useMemo(() => buildAdvancedReport({
    tasks, projects: visibleProjects, generalColumns: generalBoardColumns,
    teamId: currentTeam?.id ?? null, processId: effectiveProcess,
    assigneeId: effectiveAssignee, days, now: asOf,
  }), [tasks, visibleProjects, generalBoardColumns, currentTeam?.id, effectiveProcess, effectiveAssignee, days, asOf]);

  const teamHasInboxTasks = tasks.some(task => task.teamId === currentTeam?.id && !task.projectId);
  const processNameById = useMemo(
    () => new Map(visibleProjects.map(project => [project.id, project.name])),
    [visibleProjects],
  );
  const memberNameById = useMemo(
    () => new Map((currentTeam?.members ?? []).map(member => [member.id, member.name])),
    [currentTeam?.members],
  );
  const series = useMemo(
    () => report.buckets.map(bucket => ({
      day: date(bucket.start, { month: 'short', day: 'numeric' }),
      created: bucket.created,
      completed: bucket.completed,
    })),
    [report.buckets, date],
  );
  const s = report.summary;

  const download = () => {
    if (!currentTeam) return;
    try {
      const csv = buildAdvancedReportCsv(report);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'actiproc-operational-report-' + asOf.toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(t('Report could not be exported.'));
    }
  };

  return (
    <div className="space-y-5 pb-3" data-p31-reports>
      <section className="relative overflow-hidden rounded-[22px] border border-border/70 bg-gradient-to-br from-card via-card to-primary/[0.055] p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <ChartNoAxesCombined className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight sm:text-lg">{t('Operational reporting')}</h2>
                <Badge variant="outline" className="border-primary/20 bg-primary/[0.055] text-[10px] text-primary">{t('P3.1 Reports')}</Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {t('A reliable view of team workload, delivery and overdue work. Period filters affect activity; open work reflects the current snapshot.')}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={download}
            disabled={!currentTeam || loading} className="h-10 shrink-0 gap-2 rounded-xl bg-background/70 px-3 text-xs">
            <Download className="h-4 w-4" aria-hidden />{t('Export report CSV')}
          </Button>
        </div>

        <div className="mt-5 grid gap-2.5 border-t border-border/55 pt-4 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5">
            <label htmlFor="p31-process" className="text-[11px] font-semibold text-muted-foreground">{t('Process')}</label>
            <Select value={effectiveProcess} onValueChange={setProcessId}>
              <SelectTrigger id="p31-process" className="h-10 w-full rounded-xl border-border/70 bg-background/80 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('All processes')}</SelectItem>
                {teamHasInboxTasks && <SelectItem value="general">{t('Inbox')}</SelectItem>}
                {visibleProjects.map(project => <SelectItem value={project.id} key={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <label htmlFor="p31-assignee" className="text-[11px] font-semibold text-muted-foreground">{t('Assignee')}</label>
            <Select value={effectiveAssignee} onValueChange={setAssigneeId}>
              <SelectTrigger id="p31-assignee" className="h-10 w-full rounded-xl border-border/70 bg-background/80 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('All assignees')}</SelectItem>
                <SelectItem value="unassigned">{t('Unassigned')}</SelectItem>
                {(currentTeam?.members ?? []).map(member => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <label htmlFor="p31-period" className="text-[11px] font-semibold text-muted-foreground">{t('Activity period')}</label>
            <Select value={String(days)} onValueChange={value => setDays(Number(value) as ReportWindowDays)}>
              <SelectTrigger id="p31-period" className="h-10 w-full rounded-xl border-border/70 bg-background/80 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('Last 7 calendar days')}</SelectItem>
                <SelectItem value="30">{t('Last 30 calendar days')}</SelectItem>
                <SelectItem value="90">{t('Last 90 calendar days')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" aria-hidden />
          <span>{t('Period')}: {date(report.windowStart, { day: 'numeric', month: 'short', year: 'numeric' })} – {date(report.windowEnd, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span aria-hidden>·</span>
          <span>{currentTeam?.name ?? t('Team')}</span>
          <span aria-hidden>·</span>
          <span>{number(s.total)} {t('Actions in scope')}</span>
        </div>
      </section>

      {!currentTeam && !loading ? (
        <div className="rounded-2xl border border-dashed border-border/65 p-10 text-center text-sm text-muted-foreground">{t('Select a team to view its reports.')}</div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6" aria-label={t('Report key metrics')}>
            <Metric label={t('Open Actions')} value={number(s.open)}
              detail={t('Current snapshot')} icon={<ListTodo className="h-4 w-4" />} />
            <Metric label={t('Completion rate')} value={s.completionRate + '%'}
              detail={t('Current snapshot')} icon={<CheckCheck className="h-4 w-4" />} tone="good" />
            <Metric label={t('Overdue')} value={number(s.overdue)}
              detail={t('Due date passed by calendar day')} icon={<AlertTriangle className="h-4 w-4" />}
              tone={s.overdue ? 'warning' : 'good'} />
            <Metric label={t('Due within 7 days')} value={number(s.dueSoon)}
              detail={t('Open work, including today')} icon={<CalendarClock className="h-4 w-4" />} />
            <Metric label={t('Verified completions')} value={number(s.completedInPeriod)}
              detail={t('In selected activity period')} icon={<Activity className="h-4 w-4" />} tone="good" />
            <Metric label={t('Avg. completion time')} value={s.averageCompletionDays === null ? '—' :
              number(s.averageCompletionDays, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + 'd'}
              detail={t('{count} verified durations in period', { count: s.verifiedDurationSample })}
              icon={<Clock3 className="h-4 w-4" />} />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(250px,1fr)]">
            <section className="min-w-0 rounded-[20px] border border-border/65 bg-card/80 p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{t('Created vs. verified completed')}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {t('Activity in the selected period; not a historical backlog reconstruction.')}
                  </p>
                </div>
                <Badge variant="outline" className="border-border/60 bg-muted/30 text-[10px]">
                  {number(s.createdInPeriod)} {t('created')} · {number(s.completedInPeriod)} {t('completed')}
                </Badge>
              </div>
              <div className="mt-5 h-[220px] w-full min-w-0 sm:h-[254px]" aria-label={t('Work throughput chart')}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 10, right: 12, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="p31Completed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="4%" stopColor="#10b981" stopOpacity={0.20} />
                        <stop offset="96%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="p31Created" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="4%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="96%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 4" stroke="currentColor" strokeOpacity={0.07} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false} axisLine={false} minTickGap={22} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{
                      background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))',
                      border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12,
                    }} />
                    <Area type="monotone" dataKey="created" name={t('Created')} stroke="#6366f1"
                      strokeWidth={2} fill="url(#p31Created)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="completed" name={t('Verified completed')} stroke="#10b981"
                      strokeWidth={2} fill="url(#p31Completed)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" />{t('Created')}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t('Verified completed')}</span>
              </div>
            </section>

            <section className="rounded-[20px] border border-border/65 bg-card/80 p-4 shadow-sm sm:p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />{t('Workload signals')}
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t('Only currently open Actions are counted.')}</p>
              <div className="mt-5 space-y-4">
                {([
                  [t('Without an assignee'), s.unassigned, Users],
                  [t('No updates for 14 days'), s.stale, RefreshCw],
                  [t('Due within 7 days'), s.dueSoon, CalendarClock],
                  [t('Overdue'), s.overdue, AlertTriangle],
                ] as const).map(([label, count, Icon]) => (
                  <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />{label}</span>
                      <span className="text-xs font-semibold tabular-nums">{number(count)}</span>
                    </div>
                    <Progress value={s.open ? Math.round(count / s.open * 100) : 0} className="h-1.5" />
                  </div>
                ))}
              </div>
              {(s.missingCompletionDates > 0 || s.unresolvedStages > 0) && (
                <p className="mt-5 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.055] p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300" role="status">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {t('{missing} completed Actions have no verified completion date; {stages} Actions have an unresolved stage.',
                    { missing: s.missingCompletionDates, stages: s.unresolvedStages })}
                </p>
              )}
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,1fr)]">
            <section className="min-w-0 rounded-[20px] border border-border/65 bg-card/80 p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><Layers3 className="h-4 w-4" aria-hidden /></span>
                  <div>
                    <h3 className="text-sm font-semibold">{t('Process health')}</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{t('Current work by Process, ordered by overdue work.')}</p>
                  </div>
                </div>
                <span className="text-xs font-medium tabular-nums text-muted-foreground">{report.processRows.length}</span>
              </div>
              <div className="mt-4 space-y-2.5" data-p31-processes>
                {report.processRows.length ? report.processRows.map(process => (
                  <div key={process.id} className="rounded-[15px] border border-border/60 bg-background/55 p-3.5">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold" title={process.name}>
                          {process.id === 'general' ? t('Inbox') : process.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {number(process.open)} {t('open')} · {number(process.completed)} {t('completed')} · {number(process.completedInPeriod)} {t('verified in period')}
                        </p>
                      </div>
                      {process.overdue > 0 ? (
                        <Badge variant="outline" className="shrink-0 border-amber-500/25 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                          {number(process.overdue)} {t('overdue')}
                        </Badge>
                      ) : <Badge variant="outline" className="shrink-0 border-border/60 text-[10px] text-muted-foreground">{number(process.total)} {t('total')}</Badge>}
                    </div>
                    <div className="mt-3 flex items-center gap-2.5">
                      <Progress value={process.completionRate} className="h-1.5 flex-1" />
                      <span className="w-10 text-right text-[11px] font-semibold tabular-nums">{process.completionRate}%</span>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-border/65 px-4 py-10 text-center text-xs text-muted-foreground">
                    {t('No Actions in this reporting scope.')}
                  </div>
                )}
              </div>
            </section>

            <section className="min-w-0 rounded-[20px] border border-border/65 bg-card/80 p-4 shadow-sm sm:p-5">
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{t('Actions needing attention')}</h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {t('Overdue Actions first, followed by work with no updates for 14 days.')}
                  </p>
                </div>
              </div>
              <div className="mt-4 max-h-[375px] space-y-1.5 overflow-y-auto [scrollbar-width:thin]" data-p31-watchlist>
                {report.atRisk.length ? report.atRisk.map(action => (
                  <button type="button" key={action.id} onClick={() => openTaskEditor(action.id)}
                    className="group flex min-h-[56px] w-full items-center gap-2.5 rounded-xl border border-border/50 bg-background/55 px-3 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      action.overdueDays > 0 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
                      {action.overdueDays > 0 ? <CalendarClock className="h-4 w-4" aria-hidden /> : <Clock3 className="h-4 w-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{action.title}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {action.overdueDays > 0
                          ? t('{count} days overdue', { count: action.overdueDays })
                          : t('No updates for {count} days', { count: action.staleDays })}
                        {' · '}
                        {action.assigneeId ? memberNameById.get(action.assigneeId) ?? t('Assignee') : t('Unassigned')}
                      </span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
                  </button>
                )) : (
                  <p className="rounded-xl border border-dashed border-border/65 px-4 py-10 text-center text-xs text-muted-foreground">
                    {t('No overdue or inactive Actions in the selected scope.')}
                  </p>
                )}
              </div>
            </section>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              {t('Reporting is based on currently accessible Actions. It is not an audit log: removed Actions and earlier completion/reopen events are not reconstructed. Only verified completion timestamps contribute to historical charts and average completion time.')}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
