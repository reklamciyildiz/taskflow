// Actual BlockEditor/NodeViews. No production data or authenticated session.
import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { BlockEditor, type BlockEditorRef } from '../../components/editor/BlockEditor';

const members = [{ id: 'member-1', name: 'Tilaver Yigit' }, { id: 'member-2', name: 'Other Member' }];
const schedule = {
  id: 'schedule-1', source: { sourceType: 'checklist_item', taskId: 'action-1', checklistItemId: 'both' },
  scheduleType: 'one_off', scheduleDate: '2026-10-11', scheduleTime: '15:30', timeZone: 'Europe/Istanbul',
  recurrenceFrequency: null, recurrenceInterval: 1, recurrenceWeekdays: [], endsOn: null,
  reminderRules: [{ type: 'preset', preset: 'when_due', timeZone: 'Europe/Istanbul' }],
};
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const item = (id: string, text: string, attrs: object = {}, children: any[] = []) => ({
  type: 'taskItem', attrs: { id, checked: false, ...attrs },
  content: [paragraph(text), ...(children.length ? [{ type: 'taskList', content: children }] : [])],
});
const prose = 'Alumasta ana sayfa tasarimini bitir ve ekip ile sonraki gelistirmeleri planla.';
let nested = item('deep-8', prose, { assigneeId: members[0].id, schedule });
for (let depth = 7; depth >= 1; depth--) {
  nested = item(`deep-${depth}`, `Nested level ${depth}: ${prose}`, { schedule, assigneeId: members[0].id }, [nested]);
}
const seed = { type: 'doc', content: [{ type: 'taskList', content: [
  item('plain', prose), item('assignee', prose, { assigneeId: members[0].id }),
  item('schedule', prose, { schedule }), item('both', prose, { assigneeId: members[0].id, schedule }),
  nested, item('url', `https://example.com/${'longunbrokentext'.repeat(18)}`, { schedule }),
  item('completed', prose, { checked: true, completedAt: '2026-10-11T10:00:00Z', schedule }),
] }] };
const qa: any = (window as any).qa = { updates: 0, conversions: [], seed };
function Fixture() {
  const ref = useRef<BlockEditorRef>(null);
  qa.ref = ref;
  return <main style={{ maxWidth: 1120, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', margin: '12px auto', padding: 12, border: '1px solid hsl(var(--border))', borderRadius: 12 }}>
    <BlockEditor ref={ref} taskId="action-1" initialContent={seed} members={members}
      checklistMode hideToolbar className="checklist-editor checklist-show-completed"
      onChange={doc => { qa.updates++; qa.saved = doc; }}
      onConvertTaskItemToNote={async request => { qa.conversions.push(request); return true; }} />
    <Toaster />
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
