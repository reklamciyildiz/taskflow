'use client';

import { useState } from 'react';
import {
  ArrowUpRight, CalendarDays, Check, CheckCircle2, Circle, Clock3,
  Columns3, FileText, GripVertical, LayoutGrid, ListChecks,
  MessageSquareText, Search, Sparkles, UserRound,
} from 'lucide-react';

type PreviewTab = 'board' | 'planner' | 'notes' | 'ai';
const tabs: { key: PreviewTab; label: string; Icon: typeof LayoutGrid }[] = [
  { key: 'board', label: 'Boards', Icon: Columns3 },
  { key: 'planner', label: 'Planner', Icon: CalendarDays },
  { key: 'notes', label: 'Knowledge', Icon: FileText },
  { key: 'ai', label: 'Actiproc AI', Icon: Sparkles },
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
        <span className="text-[11px] font-semibold leading-[1.5] text-[#e9efff] sm:text-xs">{name}</span>
        <GripVertical aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#56647f]" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className={'ap-task-tag ap-task-tag-' + tone}>{type}</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[#8290ad]">
          <ListChecks className="h-3 w-3" aria-hidden /> {progress}
        </span>
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#304161] text-[9px] font-semibold text-[#cfdbf7]" aria-label="Assigned member">A</span>
      </div>
    </div>
  );
}

function BoardPanel() {
  return (
    <div className="min-w-0">
      <div className="ap-preview-toolbar">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#202f54] text-[#a7bfff]">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="truncate text-xs font-semibold text-[#f2f5ff]">Product launch</span>
          <span className="hidden rounded-md border border-[#33405a] px-1.5 py-0.5 text-[9px] font-medium text-[#8e9dba] sm:inline">Process</span>
        </div>
        <span className="text-[10px] text-[#8d9ab4]">5 Actions</span>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3 p-3 sm:grid-cols-3 sm:p-4">
        {([
          { name: 'To do', key: 'todo', color: 'bg-[#8d9fd1]', count: 2 },
          { name: 'In progress', key: 'doing', color: 'bg-[#87b7ff]', count: 2 },
          { name: 'Done', key: 'done', color: 'bg-[#96e9bd]', count: 1 },
        ] as const).map(column => (
          <div key={column.key} className="min-w-0 rounded-[13px] border border-[#2a354c] bg-[#141f34]/85 p-2.5 sm:min-h-[315px]">
            <div className="mb-3 flex items-center justify-between px-1 py-0.5">
              <div className="flex items-center gap-2">
                <span className={'h-2 w-2 rounded-full ' + column.color} />
                <span className="text-[11px] font-semibold text-[#d4def4]">{column.name}</span>
              </div>
              <span className="rounded-md border border-[#35425c] px-1.5 text-[10px] text-[#92a0bb]">{column.count}</span>
            </div>
            <div className="space-y-2">
              {actions[column.key].map(action => <BoardCard key={action.name} {...action} />)}
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
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#a7c3ff]" />
          <span className="text-xs font-semibold text-[#f1f5ff]">Your week, in focus</span>
        </div>
        <span className="text-[10px] text-[#94a1bb]">Illustrative week</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-5 gap-2">
          {days.map((d, i) => <div key={d.day} className={'rounded-xl border px-2 py-3 text-center ' + (i === 3 ? 'border-[#7a9bff]/50 bg-[#2c3d66] text-white' : 'border-[#303e5a] bg-[#18253d] text-[#aab7d0]')}>
            <p className="text-[10px]">{d.day}</p><p className="mt-1 text-base font-semibold">{d.num}</p>
          </div>)}
        </div>
        <div className="mt-4 space-y-2.5">
          {slots.map((slot) => <div key={slot.at} className="grid grid-cols-[48px_1fr] items-start gap-2">
            <span className="pt-3 text-[10px] text-[#8190ae]">{slot.at}</span>
            <div className={'rounded-xl border px-3.5 py-3 ' + (slot.selected ? 'border-[#6b8dfa]/50 bg-[#273c66]' : 'border-[#2f3d58] bg-[#17243a]')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-[#eef3ff]">{slot.title}</span>
                <Clock3 className="h-3.5 w-3.5 text-[#94a9ce]" aria-hidden />
              </div>
              <span className="mt-1 block text-[10px] text-[#a5b3d0]">{slot.detail}</span>
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
        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#b7c9ff]" />
          <span className="text-xs font-semibold text-[#f1f5ff]">Knowledge Hub</span>
        </div>
        <span className="flex items-center gap-1 rounded-lg border border-[#33415d] px-2 py-1 text-[10px] text-[#9babca]">
          <Search className="h-3 w-3" aria-hidden /> Search knowledge
        </span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] sm:p-5">
        <div className="space-y-2">
          {[
            { title: 'Launch retrospective', label: 'Learning', active: true },
            { title: 'Customer interview notes', label: 'Notes', active: false },
            { title: 'Onboarding decisions', label: 'Decision', active: false },
          ].map(note => <div key={note.title} className={'rounded-xl border px-3 py-3 ' + (note.active ? 'border-[#7591d9]/50 bg-[#2a3c61]' : 'border-[#31415a] bg-[#17243a]')}>
            <p className="truncate text-[11px] font-semibold text-[#ecf1ff]">{note.title}</p>
            <p className="mt-1.5 text-[10px] text-[#95a8c9]">{note.label}</p>
          </div>)}
        </div>
        <div className="rounded-xl border border-[#31405a] bg-[#19263c] px-4 py-4">
          <span className="rounded-md bg-[#2d4366] px-2 py-1 text-[10px] font-semibold text-[#b5d6ff]">Learning</span>
          <h4 className="mt-3 text-[14px] font-semibold text-white">Launch retrospective</h4>
          <p className="mt-3 text-[11px] leading-[1.9] text-[#a7b6d2]">
            Keep decisions close to the work that inspired them. Capture what worked, what changed, and the next useful step.
          </p>
          <div className="mt-4 border-t border-[#33415c] pt-3 text-[10px] text-[#8193b4]">Linked to · Product launch</div>
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
          <Sparkles className="h-4 w-4 text-[#b9cdff]" /> Actiproc AI
        </span>
        <span className="rounded-full border border-[#425478] px-2 py-1 text-[9px] text-[#b1c1df]">Workspace-aware assistant</span>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="ml-auto max-w-[82%] rounded-[16px] rounded-tr-sm border border-[#395277] bg-[#273f64] px-4 py-3 text-[11px] leading-relaxed text-[#f0f4ff]">
          What should I focus on next?
        </div>
        <div className="rounded-[16px] border border-[#354563] bg-[#1a2941] p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#b5c8ff]">
            <Sparkles className="h-3 w-3" aria-hidden /> Actiproc AI
          </div>
          <p className="text-[11px] leading-[1.8] text-[#d6e1f7]">Start with the onboarding review. It is already in progress and has two remaining checklist steps.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-lg border border-[#3a5479] bg-[#263d5d] px-2.5 py-1.5 text-[10px] text-[#c8ddff]">Refine onboarding flow</span>
            <span className="rounded-lg border border-[#3a5479] bg-[#263d5d] px-2.5 py-1.5 text-[10px] text-[#c8ddff]">Product launch</span>
          </div>
        </div>
        <p className="text-[10px] text-[#8e9db9]">Illustrative answer. AI access, capabilities and usage depend on plan and service availability.</p>
      </div>
    </div>
  );
}

export function MarketingWorkspacePreview() {
  const [selected, setSelected] = useState<PreviewTab>('board');
  return (
    <div className="ap-preview-outer">
      <div className="ap-preview-window">
        <div className="flex h-12 items-center gap-3 border-b border-[#28354f] bg-[#172238] px-3.5 sm:px-5">
          <div className="flex gap-1.5" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-[#e37e86]/75" /><i className="h-2.5 w-2.5 rounded-full bg-[#e9c47d]/75" /><i className="h-2.5 w-2.5 rounded-full bg-[#74c8a6]/75" /></div>
          <span className="mx-auto truncate text-[10px] font-medium tracking-wide text-[#8c9bb8] sm:text-[11px]">actiproc.com / workspace</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-[#8b9bb9]" aria-hidden />
        </div>
        <div className="grid min-w-0 grid-cols-[47px_minmax(0,1fr)] sm:grid-cols-[130px_minmax(0,1fr)]">
          <aside className="min-h-[375px] border-r border-[#293750] bg-[#121e33] p-2.5 sm:p-3.5">
            <div className="mb-6 flex items-center gap-2 px-1">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#6b92fa] text-[#09172e]"><LayoutGrid className="h-4 w-4" aria-hidden /></div>
              <span className="hidden text-xs font-semibold text-white sm:inline">Actiproc</span>
            </div>
            <div className="space-y-1">
              {tabs.map(({key,label,Icon})=>(
                <button key={key} type="button" onClick={() => setSelected(key)} title={label}
                  aria-label={'Preview ' + label} aria-pressed={selected === key}
                  className={'flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[10.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#aac2ff] ' + (selected === key ? 'bg-[#293c63] text-[#dfe9ff]' : 'text-[#91a0bc] hover:bg-[#1c2b46] hover:text-white')}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="hidden truncate sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 hidden rounded-xl border border-[#2e3f5e] bg-[#1b2c48] p-3 sm:block">
              <p className="text-[10px] font-semibold text-[#a4b9e0]">One connected space</p>
              <p className="mt-1 text-[10px] leading-4 text-[#8395b5]">From idea to outcome.</p>
            </div>
          </aside>
          <div className="min-w-0 bg-[#101b2e]">
            {selected === 'board' && <BoardPanel />}
            {selected === 'planner' && <PlannerPanel />}
            {selected === 'notes' && <KnowledgePanel />}
            {selected === 'ai' && <AIPanel />}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[10px] text-[#8995b1] sm:text-[11px]">
        <span className="inline-flex items-center gap-1.5"><Circle className="h-2 w-2 fill-[#a1ddbd] text-[#a1ddbd]" aria-hidden /> Interactive product walkthrough</span>
        <span>Illustrative workspace · not live user data</span>
      </div>
    </div>
  );
}
