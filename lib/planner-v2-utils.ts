import type { PlannerProjectionItem } from '@/lib/planner-projection';
import { addCalendarDays } from '@/lib/scheduling-domain';

export type ParsedPlannerCapture = { title: string; date: string | null; time: string | null };

function nextWeekday(today: string, weekday: number): string {
  const current = new Date(`${today}T12:00:00`).getDay();
  const delta = (weekday - current + 7) % 7 || 7;
  return addCalendarDays(today, delta);
}

/** Deliberately bounded, deterministic date parsing; uncertain input stays in the title. */
export function parsePlannerCapture(raw: string, today: string): ParsedPlannerCapture {
  let title = raw.trim();
  const lower = title.toLocaleLowerCase('tr-TR');
  let date: string | null = null;
  const dateTokens: Array<[RegExp, () => string]> = [
    [/\b(bugün|today)\b/iu, () => today],
    [/\b(yarın|tomorrow)\b/iu, () => addCalendarDays(today, 1)],
    [/\b(pazartesi|monday)\b/iu, () => nextWeekday(today, 1)],
    [/\b(salı|tuesday)\b/iu, () => nextWeekday(today, 2)],
    [/\b(çarşamba|wednesday)\b/iu, () => nextWeekday(today, 3)],
    [/\b(perşembe|thursday)\b/iu, () => nextWeekday(today, 4)],
    [/\b(cuma|friday)\b/iu, () => nextWeekday(today, 5)],
    [/\b(cumartesi|saturday)\b/iu, () => nextWeekday(today, 6)],
    [/\b(pazar|sunday)\b/iu, () => nextWeekday(today, 0)],
  ];
  for (const [pattern, resolve] of dateTokens) {
    if (!pattern.test(lower)) continue;
    date = resolve();
    title = title.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
    break;
  }
  const timeMatch = title.match(/\b(?:saat\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/iu);
  const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : null;
  if (timeMatch) title = title.replace(timeMatch[0], ' ').replace(/\s+/g, ' ').trim();
  return { title: title || raw.trim(), date, time };
}

function timeMinutes(time: string | null) {
  if (!time) return 0;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export type LaidOutPlannerBlock = { item: PlannerProjectionItem; lane: number; lanes: number };

/** Assigns readable lanes to overlapping blocks without changing domain collision rules. */
export function layoutPlannerTimeline(items: PlannerProjectionItem[]): LaidOutPlannerBlock[] {
  const sorted = [...items].sort((left, right) => timeMinutes(left.scheduleTime) - timeMinutes(right.scheduleTime));
  const active: Array<{ end: number; lane: number }> = [];
  const result: LaidOutPlannerBlock[] = [];
  for (const item of sorted) {
    const start = timeMinutes(item.scheduleTime);
    const end = start + (item.durationMinutes ?? 30);
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].end <= start) active.splice(index, 1);
    }
    const used = new Set(active.map((entry) => entry.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    active.push({ end, lane });
    result.push({ item, lane, lanes: 1 });
  }
  return result.map((entry) => {
    const entryStart = timeMinutes(entry.item.scheduleTime);
    const entryEnd = entryStart + (entry.item.durationMinutes ?? 30);
    const overlapping = result.filter((candidate) => {
      const start = timeMinutes(candidate.item.scheduleTime);
      const end = start + (candidate.item.durationMinutes ?? 30);
      return entryStart < end && start < entryEnd;
    });
    return { ...entry, lanes: Math.max(1, ...overlapping.map((candidate) => candidate.lane + 1)) };
  });
}
