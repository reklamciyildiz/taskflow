'use client';

import { useState } from 'react';
import {
  ArrowUpRight, CalendarDays, Circle, Clock3, Columns3,
  FileText, GripVertical, LayoutGrid, ListChecks, Search, Sparkles,
  BarChart3, Users, CheckCircle2,
} from 'lucide-react';

type PreviewTab = 'board' | 'planner' | 'notes' | 'ai' | 'insights' | 'team';
const tabs: { key: PreviewTab; label: string; Icon: typeof LayoutGrid }[] = [
  { key: 'board', label: 'Boards', Icon: Columns3 },
  { key: 'planner', label: 'Planner', Icon: CalendarDays },
  { key: 'notes', label: 'Knowledge', Icon: FileText },
  { key: 'ai', label: 'Actiproc AI', Icon: Sparkles },
  { key: 'insights', label: 'Insights', Icon: BarChart3 },
  { key: 'team', label: 'Team & customers', Icon: Users },
];

const actions = {
  todo: [
    { name: 'Outline launch milestones', type: 'Planning', progress: '2/5', tone: 'blue' },
    { name: 'Review customer feedback', type: 'Research', progress: '1/4', tone: 'slate' },
  ],
  doing: [
    { name: 'Refine onboarding flow', type: 'Product', progress: '4/6', tone: 'violet' },
    { name: 'Prepare release notes', type: 'Content', progress: '3/4', tone: 'blue' },
  ],
  done: [{ name: 'Align launch priorities', type: 'Decision', progress: '5/5', tone: 'green' }],
} as const;

function BoardCard({ name, type, progress, tone }: {
  name: string; type: string; progress: string; tone: string;
}) {
  return (
    <div className="ap-preview-task">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold leading-[1.5] text-[#ebfdf3] sm:text-xs">{name}</span>
        <GripVertical aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5a7b69]" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className={'ap-task-tag ap-task-tag-' + tone}>{type}</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[#86a996]">
          <ListChecks className="h-3 w-3" aria-hidden /> {progress}
        </span>
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#345d46] text-[9px] font-semibold text-[#d3f3e2]" aria-label="Assigned member">A</span>
      </div>
    </div>
  );
}

function BoardPanel() {
  const [moved, setMoved] = useState(false);
  return (
    <div className="min-w-0">
      <div className="ap-preview-toolbar">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#254f38] text-[#aff7d0]">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="truncate text-xs font-semibold text-[#f3fef8]">Product launch</span>
          <span className="hidden rounded-md border border-[#375645] px-1.5 py-0.5 text-[9px] font-medium text-[#92b6a2] sm:inline">Process</span>
        </div>
        <span className="text-[10px] text-[#91b09f]">6 Actions · sample workflow</span>
      </div>
      <div className="flex min-w-0 gap-3 overflow-x-auto p-3 overscroll-x-contain sm:grid sm:grid-cols-3 sm:overflow-visible sm:p-4">
        {([
          { name: 'To do', key: 'todo', color: 'bg-[#93cbad]', count: 2 },
          { name: 'In progress', key: 'doing', color: 'bg-[#92f4be]', count: 2 },
          { name: 'Done', key: 'done', color: 'bg-[#96e9bd]', count: 1 },
        ] as const).map(column => (
          <div key={column.key} className="min-w-[195px] shrink-0 rounded-[13px] border border-[#2d493a] bg-[#173123]/85 p-2.5 sm:min-h-[315px] sm:min-w-0 sm:shrink">
            <div className="mb-3 flex items-center justify-between px-1 py-0.5">
              <div className="flex items-center gap-2">
                <span className={'h-2 w-2 rounded-full ' + column.color} />
                <span className="text-[11px] font-semibold text-[#d7f1e3]">{column.name}</span>
              </div>
              <span className="rounded-md border border-[#395847] px-1.5 text-[10px] text-[#96b7a5]">{column.count + (column.key === 'doing' && !moved ? 1 : column.key === 'done' && moved ? 1 : 0)}</span>
            </div>
            <div className="space-y-2">
              {actions[column.key].map(action => <BoardCard key={action.name} {...action} />)}
              {column.key === 'doing' && !moved && (
                <div className="rounded-xl border border-[#688c5d] bg-[#294535] p-3">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#c8ff93]">Interactive demo</span>
                  <p className="mt-2 text-[11px] font-semibold text-white">Prepare launch checklist</p>
                  <button type="button" onClick={() => setMoved(true)}
                    className="mt-3 inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-lg bg-[#c8ff93] px-2 text-[10px] font-bold text-[#122916] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    Mark done <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              )}
              {column.key === 'done' && moved && (
                <div className="rounded-xl border border-[#688c5d] bg-[#294535] p-3" aria-live="polite">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#c8ff93]">Demo completed</span>
                  <p className="mt-2 text-[11px] font-semibold text-white">Prepare launch checklist</p>
                  <button type="button" onClick={() => setMoved(false)}
                    className="mt-3 min-h-8 w-full rounded-lg border border-[#6b9372] px-2 text-[10px] font-semibold text-[#e2ffcc] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
                    Reset demo
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlannerPanel() {
  const days = [
    { day: 'Mon', num: '12' }, { day: 'Tue', num: '13' }, { day: 'Wed', num: '14' },
    { day: 'Thu', num: '15' }, { day: 'Fri', num: '16' },
  ];
  const slots = [
    { at: '09:00', title: 'Plan the week', detail: 'Personal · 30 min', selected: false },
    { at: '11:30', title: 'Review onboarding', detail: 'Product team · 45 min', selected: true },
    { at: '15:00', title: 'Ship release notes', detail: 'Content · 30 min', selected: false },
  ];
  return (
    <div className="min-w-0">
      <div className="ap-preview-toolbar">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#aff7d0]" />
          <span className="text-xs font-semibold text-[#f2fef8]">Your week, in focus</span>
        </div>
        <span className="text-[10px] text-[#98b7a6]">Illustrative week</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-5 gap-2">
          {days.map((d, i) => <div key={d.day} className={'rounded-xl border px-2 py-3 text-center ' + (i === 3 ? 'border-[#86f3b8]/50 bg-[#316147] text-white' : 'border-[#345643] bg-[#1b3a29] text-[#adcdbb]')}>
            <p className="text-[10px]">{d.day}</p><p className="mt-1 text-base font-semibold">{d.num}</p>
          </div>)}
        </div>
        <div className="mt-4 space-y-2.5">
          {slots.map((slot) => <div key={slot.at} className="grid grid-cols-[48px_1fr] items-start gap-2">
            <span className="pt-3 text-[10px] text-[#85aa96]">{slot.at}</span>
            <div className={'rounded-xl border px-3.5 py-3 ' + (slot.selected ? 'border-[#78edae]/50 bg-[#2d6044]' : 'border-[#335442] bg-[#1a3727]')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-[#f0fdf6]">{slot.title}</span>
                <Clock3 className="h-3.5 w-3.5 text-[#99c9af]" aria-hidden />
              </div>
              <span className="mt-1 block text-[10px] text-[#a9ccb9]">{slot.detail}</span>
            </div>
          </div>)}
        </div>
      </div>
    </div>
  );
}

function KnowledgePanel() {
  return (
    <div className="min-w-0">
      <div className="ap-preview-toolbar">
        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#bdf9d9]" />
          <span className="text-xs font-semibold text-[#f2fef8]">Knowledge Hub</span>
        </div>
        <span className="flex items-center gap-1 rounded-lg border border-[#375946] px-2 py-1 text-[10px] text-[#9fc6b1]">
          <Search className="h-3 w-3" aria-hidden /> Search knowledge
        </span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:p-5">
        <div className="space-y-2">
          {[
            { title: 'Launch retrospective', label: 'Learning', active: true },
            { title: 'Customer interview notes', label: 'Notes', active: false },
            { title: 'Onboarding decisions', label: 'Decision', active: false },
          ].map(note => <div key={note.title} className={'rounded-xl border px-3 py-3 ' + (note.active ? 'border-[#7ed0a4]/50 bg-[#2f5c43]' : 'border-[#355644] bg-[#1a3727]')}>
            <p className="truncate text-[11px] font-semibold text-[#eefdf5]">{note.title}</p>
            <p className="mt-1.5 text-[10px] text-[#9ac4ad]">{note.label}</p>
          </div>)}
        </div>
        <div className="rounded-xl border border-[#355644] bg-[#1c3929] px-4 py-4">
          <span className="rounded-md bg-[#326147] px-2 py-1 text-[10px] font-semibold text-[#bcf8d6]">Learning</span>
          <h4 className="mt-3 text-[14px] font-semibold text-white">Launch retrospective</h4>
          <p className="mt-3 text-[11px] leading-[1.9] text-[#abcebb]">
            Keep decisions close to the work that inspired them. Capture what worked, what changed, and the next useful step.
          </p>
          <div className="mt-4 border-t border-[#375846] pt-3 text-[10px] text-[#86af98]">Linked to · Product launch</div>
        </div>
      </div>
    </div>
  );
}

function AIPanel() {
  return (
    <div className="min-w-0">
      <div className="ap-preview-toolbar">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-white">
          <Sparkles className="h-4 w-4 text-[#bff9da]" /> Actiproc AI
        </span>
        <span className="rounded-full border border-[#47735b] px-2 py-1 text-[9px] text-[#b5dbc6]">Workspace-aware assistant</span>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="ml-auto max-w-[82%] rounded-[16px] rounded-tr-sm border border-[#3f7155] bg-[#2c5f43] px-4 py-3 text-[11px] leading-relaxed text-[#f1fef7]">
          What should I focus on next?
        </div>
        <div className="rounded-[16px] border border-[#395f4a] bg-[#1e3d2c] p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#bcf8d8]">
            <Sparkles className="h-3 w-3" aria-hidden /> Actiproc AI
          </div>
          <p className="text-[11px] leading-[1.8] text-[#d9f4e5]">Start with the onboarding review. It is already in progress and has two remaining checklist steps.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-lg border border-[#407357] bg-[#2b583f] px-2.5 py-1.5 text-[10px] text-[#cdfae1]">Refine onboarding flow</span>
            <span className="rounded-lg border border-[#407357] bg-[#2b583f] px-2.5 py-1.5 text-[10px] text-[#cdfae1]">Product launch</span>
          </div>
        </div>
        <p className="text-[10px] text-[#92b5a2]">Illustrative answer. AI access, capabilities and usage depend on plan and service availability.</p>
      </div>
    </div>
  );
}


function InsightsPanel() {
  return (
    <div className="min-w-0">
      <div className="ap-preview-toolbar">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-white"><BarChart3 className="h-4 w-4 text-[#bef9d9]" aria-hidden /> Workspace insights</span>
        <span className="text-[10px] text-[#99b8a7]">Illustrative metrics</span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {[{ label: 'Actions completed', value: '24', note: 'Sample week' }, { label: 'Open processes', value: '03', note: 'Illustrative workspace' }].map(item => (
          <div key={item.label} className="rounded-xl border border-[#405d4d] bg-[#1d3c2b] p-4">
            <p className="text-[10px] text-[#a3cab4]">{item.label}</p>
            <p className="mt-4 text-[32px] font-semibold tracking-[-.055em] text-white">{item.value}</p>
            <p className="mt-2 text-[10px] text-[#93bfa6]">{item.note}</p>
          </div>
        ))}
        <div className="rounded-xl border border-[#405d4d] bg-[#1d3c2b] p-4 sm:col-span-2">
          <p className="text-[11px] font-semibold text-[#eefdf5]">Progress in focus</p>
          <div className="mt-5 flex h-24 items-end gap-2" aria-hidden>
            {[45, 60, 53, 80, 67, 86, 72, 95, 78].map((height, index) => (
              <span key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-[#51a777] to-[#b8ff91]" style={{ height: height + '%' }} />
            ))}
          </div>
          <p className="mt-3 text-[10px] text-[#95bca6]">Sample visualization, not real user activity.</p>
        </div>
      </div>
    </div>
  );
}

function TeamPanel() {
  return (
    <div className="min-w-0">
      <div className="ap-preview-toolbar">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-white"><Users className="h-4 w-4 text-[#bef9d9]" aria-hidden /> Team workspace</span>
        <span className="text-[10px] text-[#99b8a7]">Example team</span>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="rounded-xl border border-[#3d5d4b] bg-[#1f3f2d] p-4">
          <p className="text-xs font-semibold text-white">Shared product launch</p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#a2c5b2]">Ownership, customer context and progress stay close to the work.</p>
        </div>
        {[
          { name: 'Product rollout', team: 'Product', tag: 'In progress' },
          { name: 'Customer handoff', team: 'Customer success', tag: 'To do' },
          { name: 'Release retrospective', team: 'Operations', tag: 'Completed' },
        ].map(item => (
          <div key={item.name} className="flex items-center gap-3 rounded-xl border border-[#385a47] bg-[#1b3a29] p-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#35654a] text-[11px] font-semibold text-[#d2fbe4]">{item.team[0]}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-white">{item.name}</p><p className="mt-1 text-[10px] text-[#99c2ab]">{item.team}</p></div>
            <span className="text-[9px] font-medium text-[#b8e2b5]">{item.tag}</span>
          </div>
        ))}
        <p className="text-[10px] text-[#8eb7a0]">Illustrative team and customer workflow, not real customer information.</p>
      </div>
    </div>
  );
}

export function MarketingWorkspacePreview() {
  const [selected, setSelected] = useState<PreviewTab>('board');
  return (
    <div className="ap-preview-outer">
      <div className="ap-preview-window">
        <div className="flex h-12 items-center gap-3 border-b border-[#2c4b3a] bg-[#1a3526] px-3.5 sm:px-5">
          <div className="flex gap-1.5" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-[#e37e86]/75" /><i className="h-2.5 w-2.5 rounded-full bg-[#e9c47d]/75" /><i className="h-2.5 w-2.5 rounded-full bg-[#74c8a6]/75" /></div>
          <span className="mx-auto truncate text-[10px] font-medium tracking-wide text-[#90b4a0] sm:text-[11px]">actiproc.com / workspace</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-[#8fb5a0]" aria-hidden />
        </div>
        <div className="grid min-w-0 grid-cols-[47px_minmax(0,1fr)] sm:grid-cols-[130px_minmax(0,1fr)]">
          <aside className="min-h-[375px] border-r border-[#2d4c3b] bg-[#153021] p-2.5 sm:p-3.5">
            <div className="mb-6 flex items-center gap-2 px-1">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#78edae] text-[#0c2b1a]"><LayoutGrid className="h-4 w-4" aria-hidden /></div>
              <span className="hidden text-xs font-semibold text-white sm:inline">Actiproc</span>
            </div>
            <div className="space-y-1">
              {tabs.map(({key,label,Icon})=>(
                <button key={key} type="button" onClick={() => setSelected(key)} title={label}
                  aria-label={'Preview ' + label} aria-pressed={selected === key}
                  className={'flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[10.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b2f7d2] ' + (selected === key ? 'bg-[#2e5e44] text-[#e2fcee]' : 'text-[#95b8a5] hover:bg-[#20422f] hover:text-white')}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="hidden truncate sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 hidden rounded-xl border border-[#325a44] bg-[#1f4430] p-3 sm:block">
              <p className="text-[10px] font-semibold text-[#a9dbc0]">One connected space</p>
              <p className="mt-1 text-[10px] leading-4 text-[#88b19a]">From idea to outcome.</p>
            </div>
          </aside>
          <div className="min-w-0 bg-[#132b1e]">
            {selected === 'board' && <BoardPanel />}
            {selected === 'planner' && <PlannerPanel />}
            {selected === 'notes' && <KnowledgePanel />}
            {selected === 'ai' && <AIPanel />}
            {selected === 'insights' && <InsightsPanel />}
            {selected === 'team' && <TeamPanel />}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[10px] text-[#8dad9c] sm:text-[11px]">
        <span className="inline-flex items-center gap-1.5"><Circle className="h-2 w-2 fill-[#a1ddbd] text-[#a1ddbd]" aria-hidden /> Interactive product walkthrough</span>
        <span>Illustrative workspace · not live user data</span>
      </div>
    </div>
  );
}
