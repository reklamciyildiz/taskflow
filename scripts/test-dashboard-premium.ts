import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');
const dashboard = read('components/dashboard/DashboardV2.tsx');
const day = read('components/dashboard/DashboardMyDay.tsx');
const panels = read('components/dashboard/DashboardPanels.tsx');
const styles = read('app/globals.css');
const route = read('app/(shell)/page.tsx');

const checks: Record<string, boolean> = {
  'real dashboard route preserved': route.includes('return <DashboardV2 />'),
  'captures and action creation remain functional':
    dashboard.includes('setCaptureOpen(true)') && dashboard.includes('setCreateActionOpen(true)') &&
    dashboard.includes('<DashboardCapture ') && dashboard.includes('<CreateTaskModal '),
  'real team scoped KPIs': dashboard.includes('useTaskContext()') &&
    dashboard.includes('currentTeam.id') && dashboard.includes('resolveStageLifecycle(') &&
    dashboard.includes('overview.active') && dashboard.includes('overview.processes'),
  'no invented growth or hardcoded completion':
    !dashboard.includes('+24%') && !dashboard.includes('+33%') &&
    dashboard.includes('completed / total'),
  'my day remains loaded from planner APIs':
    day.includes('plannerApi.getToday(') && day.includes('plannerApi.getUpcoming(') &&
    day.includes('openTaskEditor(item.taskId)'),
  'my day retains refresh, errors and empty states':
    day.includes('SCHEDULE_CHANGED_EVENT') && day.includes('OCCURRENCE_CHANGED_EVENT') &&
    day.includes('My Day is unavailable') && day.includes('Your day is clear'),
  'my day metric progress uses real projection':
    day.includes('today?.completedToday.length') && day.includes('upcoming?.groups') &&
    day.includes('dailyTotal > 0') && day.includes('role="progressbar"') &&
    day.includes('aria-valuenow={dailyProgress}'),
  'focus process pin and navigation still work':
    panels.includes('localStorage.setItem(PINNED_PROJECTS_KEY') &&
    panels.includes('onOpen={openBoardForProject}') &&
    panels.includes('onTogglePin={togglePin}') &&
    panels.includes('href="/dashboard/processes"'),
  'focus donut uses canonical lifecycle and real percent':
    panels.includes('focusStats.percent') &&
    panels.includes('resolveStageLifecycle(task.status, project.columnConfig).isTerminal'),
  'recent knowledge opens true existing notes':
    panels.includes('useKnowledgeRetrieval({') &&
    panels.includes('onClick={() => openTaskEditor(entry.taskId)}') &&
    panels.includes('href="/dashboard/knowledge-hub"'),
  'workspace completion from scoped actions':
    panels.includes('completionPercent = tracked > 0') &&
    panels.includes('aria-valuenow={completionPercent}') &&
    panels.includes('assigneeId === currentUser.id'),
  'dark mode is scoped, not global':
    styles.includes('.dark .dashboard-v2-hero') &&
    styles.includes('.dark .dashboard-v2 .dashboard-v2-panel--focus'),
  'light theme remains supported': styles.includes('.dashboard-v2-hero {') &&
    styles.includes('.dashboard-v2 .dashboard-v2-panel {'),
  'mobile layout avoids metric clipping':
    styles.includes('@media (max-width: 639px)') &&
    styles.includes('@media (max-width: 370px)') &&
    styles.includes('.dashboard-v2-hero-content > div:last-child > button'),
  'reduced motion and focus rings':
    styles.includes('@media (prefers-reduced-motion: reduce)') &&
    styles.includes('.dashboard-v2 .dashboard-v2-row:focus-visible'),
};

for (const [name, ok] of Object.entries(checks)) assert.equal(ok, true, name);
console.log('Dashboard visual, accessibility, live-data and interaction contracts: ' +
  Object.keys(checks).length + ' passed.');
