import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isValidPlannerMove, plannerDragSupported, snapPlannerTime,
} from '../lib/planner-drag-reschedule';
import { appendChecklistItemToTipTap, extractChecklistItemsFromTipTap } from '../lib/tiptap-parser';
import { normalizeWorkScheduleInput } from '../lib/scheduling-domain';

const date='2026-11-02';
assert.equal(snapPlannerTime(10 * 64 + 10, 0, 64, 0, 30),'10:15');
assert.equal(snapPlannerTime(10 * 64 + 20, 0, 64, 0, 30),'10:15');
assert.equal(snapPlannerTime(10 * 64 + 40, 0, 64, 0, 30),'10:45');
assert.equal(snapPlannerTime(-300, 0, 64, 0, 30),'00:00');
assert.equal(snapPlannerTime(24 * 64 + 100, 0, 64, 0, 30),'23:30');
assert.equal(snapPlannerTime(24 * 64 + 100, 0, 64, 0, 60),'23:00');
assert.equal(snapPlannerTime(10 * 52, 0, 52, 15, 60),'09:45');
assert.equal(isValidPlannerMove({date,time:'10:30'},date,{date,time:'10:00'}),true);
assert.equal(isValidPlannerMove({date,time:'10:00'},date,{date,time:'10:00'}),false);
assert.equal(isValidPlannerMove({date:'2026-11-01',time:'10:30'},date,{date,time:'10:00'}),false);
assert.equal(isValidPlannerMove({date:'2026-11-03',time:'10:00'},date,{date,time:'10:00'}),true);
assert.equal(isValidPlannerMove({date:'2026-11-03',time:'10:17'},date,{date,time:'10:00'}),false);
assert.equal(isValidPlannerMove({date:'2026-02-30',time:'10:15'},date,{date,time:'10:00'}),false);
assert.equal(isValidPlannerMove(null,date,{date,time:'10:00'}),false);
assert.equal(plannerDragSupported(false,'11:00'),true);
assert.equal(plannerDragSupported(true,'11:00'),false,
  'Recurring time must not implicitly change whole series');
assert.equal(plannerDragSupported(false,null),false,'All day block must not turn into timed by drag');

const original={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Keep old note'}]},
 {type:'taskList',content:[{type:'taskItem',attrs:{id:'existing-id',checked:false},
   content:[{type:'paragraph',content:[{type:'text',text:'Existing chore'}]}]}]}]};
const next=appendChecklistItemToTipTap(original,{id:'created-id',text:'Wash clothes'});
assert.equal(original.content.length,2,'Original TipTap doc must not be mutated');
assert.equal(original.content[1].content.length,1);
assert.equal(next.content[1].content.length,2);
assert.deepEqual(extractChecklistItemsFromTipTap(next).map(x=>x.id),['existing-id','created-id']);
assert.equal(extractChecklistItemsFromTipTap(next)[1].text,'Wash clothes');
assert.equal(appendChecklistItemToTipTap(null,{id:'first',text:'Review invoice'}).content[0].type,'taskList');

const scheduled=normalizeWorkScheduleInput({
 source:{sourceType:'checklist_item',taskId:'task-1',checklistItemId:'created-id'},
 scheduleType:'one_off',scheduleDate:date,
 scheduleTime:'10:15',timeZone:'Europe/Istanbul',durationMinutes:45,reminderRules:[],
});
assert.equal(scheduled.source.sourceType,'checklist_item');
assert.equal(scheduled.scheduleTime,'10:15');
assert.equal(scheduled.durationMinutes,45);
const allDay=normalizeWorkScheduleInput({
 source:{sourceType:'checklist_item',taskId:'task-1',checklistItemId:'created-id'},
 scheduleType:'one_off',scheduleDate:date,scheduleTime:null,timeZone:null,durationMinutes:null,
});
assert.equal(allDay.scheduleTime,null);

const quick=fs.readFileSync('components/planner/PlannerQuickAdd.tsx','utf8');
const drag=fs.readFileSync('components/planner/usePlannerTimeDrag.ts','utf8');
const day=fs.readFileSync('components/planner/PlannerTimeline.tsx','utf8');
const calendar=fs.readFileSync('components/planner/PlannerCalendar.tsx','utf8');
const shared=fs.readFileSync('components/planner/PlannerV2View.tsx','utf8');
const mobile=fs.readFileSync('mobile/src/PlannerRuntimeAdapter.tsx','utf8');
for(const token of [
 "useState<CaptureKind>('checklist')","appendChecklistItemToTipTap(",
 "extractChecklistItemsFromTipTap(","updateTask(selectedParent.id, { checklistBlocks })",
 "source = { sourceType: 'checklist_item'","setPendingSchedule(schedule)",
 "Retry schedule","kind === 'checklist' ? today : null",
])assert.ok(quick.includes(token),'Missing safe canonical checklist capture: '+token);
for(const token of [
 "window.addEventListener('pointermove'","window.addEventListener('pointerup'",
 "window.addEventListener('pointercancel'","document.elementFromPoint(",
 "snapPlannerTime(","isValidPlannerMove(","preventClickRef.current",
])assert.ok(drag.includes(token),'Missing drag mechanic/gesture guard: '+token);
assert.equal((day.match(/onMoveRequest: \(item: PlannerProjectionItem, target: PlannerDropTarget\)/g)||[]).length,2,
  'Both day and week need the same move callback');
assert.ok(day.includes('data-planner-grid-date={date}') &&
 day.includes('touch-none select-none') && day.includes('drag.preview?.target.date'),
 'Day/week must have actual pointer targets and live preview');
assert.ok(calendar.includes('scheduleType: \'one_off\'') &&
 calendar.includes('durationMinutes: item.durationMinutes ?? 30') &&
 calendar.includes('reminderRules: item.reminderRules') &&
 calendar.includes('dispatchScheduleChanged(item.source, response.data)') &&
 calendar.includes('Confirm new time') &&
 calendar.includes('onMoveRequest={requestMove}'),
 'A drag must request confirmation and persist the canonical source/reminders/duration');
assert.ok(calendar.includes('plannerDragSupported(item.isRecurring, item.scheduleTime)'),
 'Recurring series cannot be silently converted to a one-off');
assert.ok(shared.includes('PlannerQuickAdd') && shared.includes('PlannerCalendar') &&
 mobile.includes('PlannerRuntimeProvider'), 'Web and Capacitor must share the improved Planner');
console.log('PASS: 15-minute pointer snapping, dates, recurring safety, canonical checklist creation, capture retry and platform guard');
