import React, { createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { PlannerV2 } from '../../components/planner/PlannerV2';

const Context = createContext<any>(null);
export const useTaskContext = () => useContext(Context);

const date = '2026-10-20';
const base = (id: string, title: string, overrides: Record<string, unknown> = {}) => ({
  id, source: { sourceType: 'action', taskId: id }, scheduleId: `schedule-${id}`,
  scheduleDate: date, occurrenceDate: date, effectiveDate: date, state: 'pending', completedAt: null,
  organizationId: 'org', teamId: 'team', taskId: id, taskTitle: title, checklistItemId: null,
  checklistItemText: null, projectId: 'p1', projectName: 'SmartSafe AI', assigneeId: 'user',
  scheduleTime: null, timeZone: null, durationMinutes: null, isRecurring: false,
  recurrenceFrequency: null, recurrenceInterval: 1, recurrenceWeekdays: [], endsOn: null,
  reminderRules: [], missedCount: 0, ...overrides,
});
const todayItems = [
  base('long', 'Planner içinde hangi işi hangi sırayla ve ne zaman yapacağımı belirlemek için mobil uyumlu premium bir günlük planlama deneyimi hazırla', { scheduleTime: '14:30', timeZone: 'Europe/Istanbul', durationMinutes: 60 }),
  base('routine', 'İlaçlarını iç', { scheduleTime: '22:10', timeZone: 'Europe/Istanbul', durationMinutes: 15, isRecurring: true, recurrenceFrequency: 'daily', missedCount: 2 }),
  base('check', 'GPU benchmark sonucunu doğrula', { source: { sourceType: 'checklist_item', taskId: 'parent', checklistItemId: 'stable-check' }, taskId: 'parent', taskTitle: 'YOLOv9 optimizasyonu', checklistItemId: 'stable-check', checklistItemText: 'GPU benchmark sonucunu doğrula', scheduleTime: '15:00', timeZone: 'Europe/Istanbul', durationMinutes: 45 }),
];
const allDay = Array.from({ length: 6 }, (_, index) => base(`all-${index}`, `All-day planning item ${index + 1} with a deliberately descriptive title`));
const timed = [
  base('block-a', 'Design review', { scheduleTime: '10:00', timeZone: 'Europe/Istanbul', durationMinutes: 60 }),
  base('block-b', 'API verification', { scheduleTime: '10:30', timeZone: 'Europe/Istanbul', durationMinutes: 45 }),
  base('block-c', 'Mobile polish', { scheduleTime: '14:00', timeZone: 'Europe/Istanbul', durationMinutes: 90 }),
];
const routines = Array.from({ length: 4 }, (_, index) => base(`routine-${index}`, ['İlaçlarını iç', 'Diş fırçala', 'Perfect Posture egzersizi', 'Günlük planlama'][index], {
  isRecurring: true, recurrenceFrequency: 'daily', scheduleTime: index < 2 ? `2${index + 1}:10` : null,
  timeZone: index < 2 ? 'Europe/Istanbul' : null, source: index < 3
    ? { sourceType: 'checklist_item', taskId: `parent-${index}`, checklistItemId: `stable-${index}` }
    : { sourceType: 'action', taskId: `routine-${index}` },
  taskId: index < 3 ? `parent-${index}` : `routine-${index}`, checklistItemId: index < 3 ? `stable-${index}` : null,
  checklistItemText: index < 3 ? ['İlaçlarını iç', 'Diş fırçala', 'Perfect Posture egzersizi'][index] : null,
}));

const apiResponse = (url: string) => {
  if (url.includes('/api/planner/today')) return { success: true, data: { date, overdue: [], today: todayItems, completedToday: [] } };
  if (url.includes('/api/planner/routines')) return { success: true, data: routines };
  if (url.includes('/api/planner/upcoming')) return { success: true, data: { startDate: date, endDate: '2026-10-26', groups: [{ date, items: [...allDay, ...timed] }] } };
  return { success: true, data: null };
};
window.fetch = (async (input: RequestInfo | URL) => new Response(JSON.stringify(apiResponse(String(input))), {
  status: 200, headers: { 'Content-Type': 'application/json' },
})) as typeof fetch;

const columns = [{ id: 'todo', title: 'To Do', isTerminal: false }, { id: 'done', title: 'Done', isTerminal: true }];
const tasks = [
  { id: 'anytime', title: 'Unscheduled personal Action', status: 'todo', teamId: 'team', projectId: null, schedule: null, createdBy: 'user', updatedAt: new Date(), checklistBlocks: [] },
];
const context = {
  tasks, projects: [{ id: 'p1', name: 'SmartSafe AI', columnConfig: columns }], currentTeam: { id: 'team' },
  currentUser: { id: 'user' }, generalBoardColumns: columns, loading: false,
  addTask: async (task: any) => ({ ...task, id: 'new', schedule: null }), updateTask: async () => true,
  openTaskEditor: () => undefined, canCompleteTask: () => true, canEditTask: () => true,
};

const params = new URLSearchParams(window.location.search);
document.documentElement.classList.toggle('dark', params.get('theme') !== 'light');
createRoot(document.getElementById('root')!).render(
  <Context.Provider value={context}>
    <div className="min-h-screen bg-background p-4 text-foreground sm:p-8"><PlannerV2 /></div>
    <Toaster />
  </Context.Provider>,
);
window.setTimeout(() => {
  const view = params.get('view') ?? 'today';
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .find((candidate) => candidate.textContent?.toLowerCase().includes(view));
  button?.click();
  document.documentElement.dataset.ready = 'true';
}, 900);
