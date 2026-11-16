import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAdvancedReport, startOfLocalDay, type ReportingInput } from '../lib/metrics/advanced-reporting';
import { buildAdvancedReportCsv, csvCell } from '../lib/metrics/advanced-report-csv';
import { trCatalog } from '../lib/i18n/catalog';
import type { Project, ProjectColumnConfig, Task } from '../lib/types';

const now = new Date('2026-11-16T12:00:00.000Z');
const team = 'team-one';
const otherTeam = 'team-two';
const p1 = 'process-visible';
const p2 = 'process-other-team';
const day = startOfLocalDay(now);
const move = (days: number, hour = 12) => {
  const value = new Date(day);
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value;
};
const cols: ProjectColumnConfig[] = [
  { id: 'ideas', title: 'Ideas' },
  { id: 'approved', title: 'Approved', isTerminal: true },
];
const proj = (id: string, teamId: string): Project =>
  ({ id, name: id, teamId, organizationId: 'org', columnConfig: cols, createdAt: move(-80) });
const projects: Project[] = [proj(p1, team), proj(p2, otherTeam)];
const task = (id: string, change: Partial<Task>): Task => ({
  id, title: id, teamId: team, projectId: p1, status: 'ideas',
  createdAt: move(-10), updatedAt: move(-1), completedAt: null,
  dueDate: undefined, assigneeId: 'alice', priority: 'medium',
  description: '', createdBy: 'alice', boardPosition: 0,
  attachments: [], comments: [], ...change,
});
const maliciousTitle = '=HYPERLINK("https://bad.invalid","click")';
const tasks = [
  task('done-recent', { status: 'approved', createdAt: move(-5), completedAt: move(-1) }),
  task('overdue', { title: maliciousTitle, dueDate: move(-3, 0), updatedAt: move(-24), assigneeId: null }),
  task('due-today', { dueDate: move(0, 0) }),
  task('legacy-done', { status: 'approved', createdAt: move(-50), completedAt: null }),
  task('done-old', { status: 'approved', createdAt: move(-55), completedAt: move(-40) }),
  task('inbox-due', { projectId: null, status: 'todo', dueDate: move(2), assigneeId: null, createdAt: move(-1) }),
  task('unknown-stage', { status: 'missing-custom-stage', updatedAt: move(-1) }),
  task('different-team', { teamId: otherTeam, projectId: p2, dueDate: move(-8) }),
  task('invisible-process', { projectId: 'not-visible', title: 'TOP SECRET', dueDate: move(-90) }),
];
const args: ReportingInput = {
  tasks, projects, generalColumns: [
    { id: 'todo', title: 'Waiting' },
    { id: 'settled', title: 'Settled', isTerminal: true },
  ],
  teamId: team, processId: 'all', assigneeId: 'all', days: 30, now,
};
const report = buildAdvancedReport(args);
assert.equal(report.summary.total, 7, 'Only current team + accessible Process Actions must be counted');
assert.equal(report.summary.completed, 3, 'Custom terminal stages must be respected');
assert.equal(report.summary.open, 4);
assert.equal(report.summary.completionRate, 43);
assert.equal(report.summary.overdue, 1, 'A midnight deadline today must not be overdue');
assert.equal(report.summary.dueSoon, 2, 'Today and next two days are due-soon');
assert.equal(report.summary.unassigned, 2);
assert.equal(report.summary.stale, 1);
assert.equal(report.summary.completedInPeriod, 1, 'Only verifiable completions in window');
assert.equal(report.summary.missingCompletionDates, 1, 'Missing history is explicit');
assert.equal(report.summary.unresolvedStages, 1, 'Unmatched stage not treated as complete');
assert.equal(report.summary.verifiedDurationSample, 1);
assert.equal(report.summary.averageCompletionDays, 4);
assert.equal(report.buckets.length, 30);
assert.equal(report.buckets.reduce((sum, b) => sum + b.completed, 0), 1);
assert.equal(report.buckets.reduce((sum, b) => sum + b.created, 0), report.summary.createdInPeriod);
assert.equal(report.processRows.length, 2);
assert.equal(report.processRows.find(p => p.id === 'general')?.open, 1);
assert.equal(report.processRows.find(p => p.id === p1)?.overdue, 1);
assert.equal(report.atRisk[0].overdueDays, 3);
assert.ok(!report.processRows.some(p => p.id === p2));
assert.ok(!report.atRisk.some(a => a.title === 'TOP SECRET'));

const recent = buildAdvancedReport({ ...args, days: 7 });
assert.equal(recent.buckets.length, 7);
assert.equal(recent.summary.completedInPeriod, 1);
const quarter = buildAdvancedReport({ ...args, days: 90 });
assert.equal(quarter.buckets.length, 13, '90d chart should render weekly buckets');
assert.equal(quarter.summary.completedInPeriod, 2);
const filtered = buildAdvancedReport({ ...args, processId: p1, assigneeId: 'alice' });
assert.equal(filtered.summary.total, 5);
assert.equal(filtered.summary.overdue, 0);
assert.equal(filtered.processRows.length, 1);
const boundaryDue = buildAdvancedReport({
  ...args,
  tasks: [task('due-day-seven', { dueDate: move(7), createdAt: move(-1) }),
          task('due-day-six', { dueDate: move(6), createdAt: move(-1) })],
});
assert.equal(boundaryDue.summary.dueSoon, 1, 'Seven calendar dates include today through day six only');
const inboxOnly = buildAdvancedReport({ ...args, processId: 'general' });
assert.equal(inboxOnly.summary.total, 1);
const unassigned = buildAdvancedReport({ ...args, assigneeId: 'unassigned' });
assert.equal(unassigned.summary.total, 2);
assert.equal(buildAdvancedReport({ ...args, teamId: 'unavailable-team' }).summary.total, 0);
assert.equal(buildAdvancedReport({ ...args, processId: 'invisible' }).summary.total, 0);
const previous = buildAdvancedReport({ ...args, now: move(-20), days: 30 });
assert.equal(previous.summary.completedInPeriod, 1, 'Older verified completion is still in this historical period');
const futureOnly = buildAdvancedReport({ ...args, tasks: [tasks[0]], now: move(-20), days: 30 });
assert.equal(futureOnly.summary.completedInPeriod, 0, 'Future completion is excluded from a prior report window');
assert.equal(previous.summary.overdue, 0, 'Overdue uses chosen snapshot day, not current wall clock');

assert.equal(csvCell('   =1+2'), '"\'   =1+2"');
assert.equal(csvCell('@cmd'), '"\'@cmd"');
assert.equal(csvCell('safe "quote", and comma'), '"safe ""quote"", and comma"');
assert.equal(csvCell('\t+1'), '"\'\t+1"');
const exportText = buildAdvancedReportCsv(report);
assert.ok(exportText.startsWith('\uFEFF'));
assert.ok(exportText.includes('"\'' + maliciousTitle.replace(/"/g, '""') + '"'),
  'CSV Action names must be escaped and formula-neutralized');
assert.ok(!exportText.includes('TOP SECRET'));
assert.ok(exportText.includes('verified last-completion timestamps'));
assert.ok(exportText.includes('\r\n'));

const analytics = readFileSync('components/Analytics.tsx', 'utf8');
const ui = readFileSync('components/analytics/AdvancedReports.tsx', 'utf8');
assert.ok(analytics.includes('<AdvancedReports />'));
assert.ok(analytics.includes("analyticsView === 'reports'"));
for (const keyword of [
  'buildAdvancedReport(', 'buildAdvancedReportCsv(', 'openTaskEditor(action.id)',
  'report.atRisk.map(', 'report.processRows.map(', 'role=', "setAssigneeId('all')",
  'data-p31-watchlist', 'data-p31-processes', 'aria-label=', 'Current snapshot',
]) assert.ok(ui.includes(keyword), 'P3.1 UI contract missing: ' + keyword);
for (const key of [
  'Advanced reports', 'Operational reporting', 'Activity period',
  'Due date passed by calendar day', 'Verified completed',
  'Current snapshot', 'No updates for 14 days',
  'Reporting is based on currently accessible Actions. It is not an audit log: removed Actions and earlier completion/reopen events are not reconstructed. Only verified completion timestamps contribute to historical charts and average completion time.',
]) assert.ok(Object.hasOwn(trCatalog, key), 'Missing Turkish translation: ' + key);

console.log(JSON.stringify({
  suite: 'P3.1 advanced operational reporting',
  passed: true, fixtureTasks: tasks.length, checks: 48,
}));
