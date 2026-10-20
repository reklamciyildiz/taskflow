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

let upcomingRequests = 0;
const apiResponse = (url: string) => {
  if (url.includes('/api/planner/today')) return { success: true, data: { date, overdue: [], today: todayItems, completedToday: [] } };
  if (url.includes('/api/planner/routines')) return { success: true, data: routines };
  if (url.includes('/api/planner/upcoming')) {
    upcomingRequests += 1;
    return { success: true, data: { startDate: date, endDate: '2026-10-26', groups: [{ date, items: [...allDay, ...timed] }] } };
  }
  return { success: true, data: null };
};
const browserFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes('/__visual-result')) return browserFetch(input, init);
  return new Response(JSON.stringify(apiResponse(String(input))), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

const columns = [{ id: 'todo', title: 'To Do', isTerminal: false }, { id: 'done', title: 'Done', isTerminal: true }];
const tasks = Array.from({ length: 18 }, (_, index) => ({
  id: `anytime-${index}`,
  title: index === 8
    ? 'Tech Istanbul - Uygulamalı Yapay Zeka Geliştirme Programı için oldukça uzun plansız Action başlığı'
    : `Unscheduled personal Action ${index + 1}`,
  status: 'todo',
  teamId: 'team',
  projectId: index % 3 === 0 ? null : 'p1',
  schedule: null,
  createdBy: 'user',
  updatedAt: new Date(),
  checklistBlocks: [],
}));
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
const pause = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
const findButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')]
  .find((candidate) => candidate.textContent?.trim() === label);
const openRoutineMenu = () => {
  const trigger = document.querySelector<HTMLButtonElement>('.planner-v2-routine-menu-trigger');
  trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
};
const isolateCalendarVisual = (targets: Element[]) => {
  document.querySelectorAll<HTMLElement>('.planner-v2-hero, .planner-v2-capture, .planner-v2-tabs')
    .forEach((element) => { element.style.display = 'none'; });
  document.querySelectorAll<HTMLElement>('.planner-v2-calendar > *').forEach((element) => {
    if (!targets.some((target) => element === target || element.contains(target))) element.style.display = 'none';
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
};

window.setTimeout(async () => {
  const view = params.get('view') ?? 'today';
  const button = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .find((candidate) => candidate.textContent?.toLowerCase().includes(view));
  button?.click();
  await pause(500);

  const visualState = params.get('state');
  if (visualState && params.get('probe') !== '1') {
    const timeline = document.querySelector<HTMLElement>('[data-planner-timeline="day"]');
    if (visualState === 'jump-2' || visualState === 'jump-22') {
      const jumpSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Jump to hour"]');
      if (jumpSelect) {
        jumpSelect.value = visualState === 'jump-2' ? '2' : '22';
        jumpSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (timeline?.parentElement) isolateCalendarVisual([timeline.parentElement]);
    } else if (visualState === 'timeline-end' && timeline) {
      timeline.scrollTop = timeline.scrollHeight;
      if (timeline.parentElement) isolateCalendarVisual([timeline.parentElement]);
    } else if (visualState === 'anytime-summary') {
      const anytimeSection = document.querySelector('.planner-v2-anytime');
      if (anytimeSection) isolateCalendarVisual([anytimeSection]);
    } else if (visualState === 'anytime-all') {
      findButton('View all')?.click();
    } else if (visualState === 'schedule-dialog') {
      document.querySelector<HTMLButtonElement>('[aria-label^="Edit Design review"]')?.click();
    } else if (visualState === 'quick-add') {
      document.querySelector<HTMLButtonElement>('[data-slot-time="08:00"]')?.click();
    } else if (visualState === 'routine-menu') {
      openRoutineMenu();
    }
    await pause(400);
  }
  document.documentElement.dataset.ready = 'true';
  if (params.get('probe') !== '1') return;
  const timeline = document.querySelector<HTMLElement>('[data-planner-timeline="day"]');
  const timelineClientWidth = timeline?.clientWidth ?? -1;
  const timelineScrollWidth = timeline?.scrollWidth ?? -1;
  const viewportWidth = document.documentElement.clientWidth;
  const overflowingElements = [...document.querySelectorAll<HTMLElement>('body *')]
    .filter((element) => element.scrollWidth > element.clientWidth + 1)
    .filter((element) => element.getBoundingClientRect().right > viewportWidth || element.className?.toString().includes('planner-v2') || Boolean(element.closest('.planner-v2-anytime')))
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      className: element.className?.toString().slice(0, 120) ?? '',
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      right: Math.round(element.getBoundingClientRect().right),
    }))
    .slice(0, 20);
  const fullDayScrollable = Boolean(timeline && timeline.scrollHeight > timeline.clientHeight);
  const initialScrollTop = timeline?.scrollTop ?? -1;
  const slot0200 = document.querySelector<HTMLButtonElement>('[data-slot-time="02:00"]');
  const slot0800 = document.querySelector<HTMLButtonElement>('[data-slot-time="08:00"]');
  const slot1400 = document.querySelector<HTMLButtonElement>('[data-slot-time="14:00"]');
  const slot2200 = document.querySelector<HTMLButtonElement>('[data-slot-time="22:00"]');
  const slot2330 = document.querySelector<HTMLButtonElement>('[data-slot-time="23:30"]');
  if (timeline) timeline.scrollTop = 0;
  const reachedStart = timeline?.scrollTop === 0;
  if (timeline) timeline.scrollTop = timeline.scrollHeight;
  const reachedEnd = Boolean(timeline && timeline.scrollTop > 0 && timeline.scrollTop + timeline.clientHeight >= timeline.scrollHeight - 2);
  const jumpSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Jump to hour"]');
  if (jumpSelect) {
    jumpSelect.value = '2';
    jumpSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await pause(500);
  const jumpedToEarlyHour = Boolean(timeline && timeline.scrollTop < 180);
  const day21 = [...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')]
    .find((candidate) => candidate.querySelector('strong')?.textContent === '21');
  day21?.click();
  await pause(150);
  const dayNavigationWorked = day21?.getAttribute('aria-pressed') === 'true';
  const day20 = [...document.querySelectorAll<HTMLButtonElement>('[aria-pressed]')]
    .find((candidate) => candidate.querySelector('strong')?.textContent === '20');
  day20?.click();
  const weekButton = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.trim() === 'Week');
  weekButton?.click();
  await pause(150);
  const weekModeWorked = Boolean(document.querySelector('[data-planner-timeline="week"]'));
  const dayButton = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((candidate) => candidate.textContent?.trim() === 'Day');
  dayButton?.click();
  await pause(150);
  slot0800?.click();
  await pause(350);
  const captureDate = document.querySelector<HTMLInputElement>('.planner-v2-capture input[type="date"]')?.value;
  const captureTime = document.querySelector<HTMLInputElement>('.planner-v2-capture input[type="time"]')?.value;
  const block = document.querySelector<HTMLButtonElement>('[aria-label^="Edit Design review"]');
  block?.click();
  await pause(250);
  const dialogOpened = Boolean(document.querySelector('[role="dialog"]'));
  const requestsBeforeScheduleEvent = upcomingRequests;
  window.dispatchEvent(new Event('axiom:schedule-changed'));
  await pause(250);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await pause(150);
  const mainAnytimeRows = document.querySelectorAll('.planner-v2-anytime .planner-v2-anytime-row').length;
  findButton('View all')?.click();
  await pause(250);
  const anytimeSheet = document.querySelector<HTMLElement>('.planner-v2-anytime-sheet');
  const anytimeSheetRows = anytimeSheet?.querySelectorAll('.planner-v2-anytime-row').length ?? 0;
  const anytimeSheetFitsViewport = Boolean(anytimeSheet && anytimeSheet.getBoundingClientRect().left >= -1 && anytimeSheet.getBoundingClientRect().right <= window.innerWidth + 1);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await pause(150);
  const routinesTab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .find((candidate) => candidate.textContent?.toLowerCase().includes('routines'));
  routinesTab?.click();
  await pause(250);
  openRoutineMenu();
  await pause(150);
  const routineMenuOpened = Boolean(document.querySelector('[role="menu"]'));
  const result = {
    fullDayScrollable,
    slotsAvailable: [slot0200, slot0800, slot1400, slot2200, slot2330].every(Boolean),
    initialFocusApplied: initialScrollTop > 0,
    reachedStart,
    reachedEnd,
    jumpedToEarlyHour,
    dayNavigationWorked,
    weekModeWorked,
    emptySlotPrefilledQuickAdd: captureDate === date && captureTime === '08:00',
    blockOpenedScheduleDialog: dialogOpened,
    scheduleEventReloaded: upcomingRequests > requestsBeforeScheduleEvent,
    rootHasNoHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    bodyHasNoHorizontalOverflow: document.body.scrollWidth <= document.body.clientWidth + 1,
    timelineHasNoHorizontalOverflow: timelineScrollWidth <= timelineClientWidth + 1,
    anytimeSummaryIsBounded: mainAnytimeRows === 4,
    anytimeViewAllShowsEveryTask: anytimeSheetRows === tasks.length,
    anytimeSheetFitsViewport,
    routineMenuOpened,
    layout: {
      viewportWidth,
      rootClientWidth: document.documentElement.clientWidth,
      rootScrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      timelineClientWidth,
      timelineScrollWidth,
      overflowingElements,
    },
  };
  await browserFetch('/__visual-result', { method: 'POST', body: JSON.stringify(result) });
}, 900);
