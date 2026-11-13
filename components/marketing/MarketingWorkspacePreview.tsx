'use client';

import {createContext,useContext,useMemo,useState} from 'react';
import {marketingT,type MarketingLocale} from '@/lib/marketing-locale';
const MarketingLocaleContext=createContext<MarketingLocale>('en');
function useT(){return marketingT(useContext(MarketingLocaleContext));}
import {
  ArrowRight, ArrowUpRight, BarChart3, Bell, BookOpen, CalendarDays,
  Check, CheckCircle2, ChevronDown, Clock3, Columns3, FileText, FolderOpen,
  GripVertical, LayoutGrid, ListChecks, ListFilter, Plus, Search, ShieldCheck,
  Sparkles, Star, Users, Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type PreviewTab = 'board' | 'planner' | 'notes' | 'ai' | 'insights' | 'team';
type Stage = 'Ideas' | 'In progress' | 'Review' | 'Waiting' | 'Done' | 'Approved';
type Work = { id: string; name: string; stage: Stage; priority: 'MEDIUM'|'HIGH'|'LOW'; checklist?: string; owner?: string };

const tabs: { key: PreviewTab; label: string; Icon: LucideIcon }[] = [
  { key: 'board', label: 'Boards', Icon: Columns3 },
  { key: 'planner', label: 'Planner', Icon: CalendarDays },
  { key: 'notes', label: 'Knowledge', Icon: BookOpen },
  { key: 'ai', label: 'Actiproc AI', Icon: Sparkles },
  { key: 'insights', label: 'Insights', Icon: BarChart3 },
  { key: 'team', label: 'Team & customers', Icon: Users },
];
const stages: { name: Stage; tone: string }[] = [
  { name: 'Ideas', tone: 'blue' },
  { name: 'In progress', tone: 'purple' },
  { name: 'Review', tone: 'amber' },
  { name: 'Waiting', tone: 'cyan' },
  { name: 'Done', tone: 'rose' },
  { name: 'Approved', tone: 'green' },
];
const work: Work[] = [
  { id:'w1', name:'Refresh the onboarding checklist', stage:'Ideas', priority:'MEDIUM', checklist:'2/6' },
  { id:'w2', name:'Research customer discovery themes', stage:'Ideas', priority:'HIGH', owner:'AM' },
  { id:'w3', name:'Draft next quarter roadmap', stage:'Ideas', priority:'MEDIUM' },
  { id:'w4', name:'Improve trial activation flow', stage:'In progress', priority:'HIGH', checklist:'4/6', owner:'JD' },
  { id:'w5', name:'Publish customer help center', stage:'In progress', priority:'MEDIUM', checklist:'3/5' },
  { id:'w6', name:'Prepare product launch checklist', stage:'In progress', priority:'MEDIUM', checklist:'3/4' },
  { id:'w7', name:'Review partner proposal', stage:'Review', priority:'HIGH', owner:'SK' },
  { id:'w8', name:'Finalize new dashboard copy', stage:'Review', priority:'LOW' },
  { id:'w9', name:'Await design sign-off', stage:'Waiting', priority:'MEDIUM' },
  { id:'w10', name:'Complete user interviews', stage:'Done', priority:'MEDIUM', checklist:'5/5' },
];
const notes = [
  { id:'n1', title:'Launch retrospective', type:'Notes', detail:'What worked, what changed, and decisions for the next release.', context:'Product launch', count:'2/4 done' },
  { id:'n2', title:'Research interview synthesis', type:'Notes', detail:'Recurring themes from discovery calls and ideas worth exploring.', context:'Customer research', count:'3/6 done' },
  { id:'n3', title:'Customer onboarding playbook', type:'Checklists', detail:'A repeatable handoff from first conversation to first value.', context:'Customer success', count:'8/12 done' },
  { id:'n4', title:'Product principles & decisions', type:'Notes', detail:'Our agreed design principles, constraints, and trade-offs.', context:'Operations', count:'1/3 done' },
  { id:'n5', title:'Weekly launch readiness', type:'Checklists', detail:'QA, documentation, announcements, and the release owner.', context:'Product launch', count:'7/9 done' },
  { id:'n6', title:'Team working agreements', type:'Notes', detail:'How decisions are shared, projects are reviewed, and focus is protected.', context:'Northstar Studio', count:'2/2 done' },
] as const;

const surface='rounded-xl border border-[#33434b] bg-[#1b262d]';
const smallLabel='text-[9px] font-semibold uppercase tracking-[.16em] text-[#a4bdc2]';

function MiniHeader({ title, subtitle, Icon }: { title: string; subtitle: string; Icon: LucideIcon }) {
  const t=useT();
  return <div className="flex min-w-0 items-start justify-between gap-3 border-b border-[#32404a] px-3 py-3 sm:px-5 sm:py-4">
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[9px] font-bold tracking-[.18em] text-[#bfff92]">
        <Icon className="h-3 w-3" aria-hidden /> {t("WORKSPACE / NORTHSTAR STUDIO")}
      </p>
      <h3 className="mt-1.5 truncate text-[19px] font-bold tracking-[-.045em] text-white sm:text-[24px]">{t(title)}</h3>
      <p className="mt-0.5 text-[10px] text-[#9aadb7] sm:text-[11px]">{t(subtitle)}</p>
    </div>
    <span className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-[#334a47] bg-[#1e3430] px-2.5 py-2 text-[10px] text-[#bceac0] md:inline-flex">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden/> {t("Sample workspace")}
    </span>
  </div>;
}

function BoardPanel({ moved, setMoved, created, query }: {
  moved: boolean; setMoved: (next: boolean)=>void; created: boolean; query: string;
}) {
  const t=useT();
  const locale=useContext(MarketingLocaleContext);
  const [stage, setStage]=useState<'All'|Stage>('All');
  const cards=useMemo(()=>{
    const list:Work[]=[...work];
    if(created)list.unshift({id:'created',name:'Plan the next product sprint',stage:'Ideas',priority:'MEDIUM'});
    return list.filter(item=>{
      const realStage=moved && item.id==='w6'?'Done':item.stage;
      return (!query || (item.name.toLowerCase().includes(query.toLowerCase())||t(item.name).toLowerCase().includes(query.toLocaleLowerCase(locale==='tr'?'tr-TR':'en-US')))) && (stage==='All'||realStage===stage);
    });
  },[moved,created,query,stage]);
  return <div className="min-w-0">
    <MiniHeader title={t("Product launch")} subtitle="Organize work, track progress, and move Actions through your workflow." Icon={LayoutGrid}/>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#293942] bg-[#162128] px-3 py-2.5 sm:px-5">
      <div className="flex items-center gap-2">
        <span className={smallLabel}>{t("ACTIVE PROCESS")}</span>
        <span className="rounded-lg border border-[#344b47] bg-[#102225] px-2.5 py-1.5 text-[10px] font-semibold text-[#f2faf7]">
          <LayersIcon/> {t("Product launch")} <ChevronDown className="ml-1 inline h-3 w-3" aria-hidden/>
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-[#b4c5c6]"><ListChecks className="h-3.5 w-3.5" aria-hidden/>{cards.length} visible Actions</div>
    </div>
    <div className="ap-real-pills flex items-center gap-1.5 overflow-x-auto border-b border-[#2b3a42] bg-[#111c22] px-3 py-2.5 sm:px-5" aria-label={t("Filter demo board by stage")}>
      <span className={'mr-1 shrink-0 '+smallLabel}>{t("STAGES")}</span>
      {(['All',...stages.map(s=>s.name)] as ('All'|Stage)[]).map(name=>
        <button type="button" key={name} onClick={()=>setStage(name)} aria-pressed={stage===name}
          className={'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] '+
            (stage===name?'border-[#c8ff93] bg-[#c8ff93] text-[#112016]':'border-[#31444a] text-[#e2eeea] hover:border-[#b9ff92]')}>{t(name)}</button>)}
    </div>
    <div className="ap-real-board-scroll flex gap-2.5 overflow-x-auto p-3 sm:gap-3 sm:p-4" aria-label={t("Product launch sample Kanban board")}>
      {stages.filter(s=>stage==='All'||s.name===stage).map((column)=>{
        const items=cards.filter(card=>(moved&&card.id==='w6'?'Done':card.stage)===column.name);
        return <section key={column.name} className={'ap-real-column ap-real-column-'+column.tone+' min-w-[190px] flex-1 shrink-0 overflow-hidden rounded-[15px] border border-[#354550] sm:min-w-[208px]'} aria-label={t(column.name)+' '+t('stage')}>
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-3">
            <div className="flex items-center gap-2"><span className="ap-real-stage-dot h-3 w-3 rounded-full" aria-hidden/>
              <span className="text-[11px] font-semibold text-[#eff9fa]">{t(column.name)}</span></div>
            <span className="rounded-full border border-white/15 bg-black/20 px-1.5 py-0.5 text-[10px] text-[#c1d4da]">{items.length}</span>
          </div>
          <div className="space-y-2 p-2.5">
            {items.map(item=><div key={item.id} className="ap-real-action-card rounded-[13px] border border-[#394a55] bg-[#202c34] p-3">
              <div className="flex items-center justify-between gap-2 text-[8px] font-bold uppercase tracking-[.14em] text-[#a9c1bb]">
                <span className="inline-flex items-center gap-1"><ListChecks className="h-3 w-3" aria-hidden/>{t("Action")}</span>
                <GripVertical className="h-3.5 w-3.5 text-[#678088]" aria-hidden/>
              </div>
              <p className="mt-2 min-h-[36px] text-[11px] font-semibold leading-[1.45] text-[#f7fafb]">{t(item.name)}</p>
              <div className="mt-3 flex items-center gap-1.5 border-t border-[#3d5057] pt-2.5">
                <span className="rounded-full border border-[#315173] bg-[#1d3749] px-2 py-0.5 text-[9px] font-bold text-[#8ac5ff]">{t(item.priority)}</span>
                {item.checklist&&<span className="ml-auto inline-flex items-center gap-1 text-[9px] text-[#9fb1bb]"><ListChecks className="h-3 w-3" aria-hidden/>{item.checklist}</span>}
                {item.owner&&<span className="ml-auto rounded-full bg-[#2d5348] px-1.5 py-1 text-[8px] font-bold text-[#d5ffdd]">{item.owner}</span>}
              </div>
              {item.id==='w6'&&!moved&&<button type="button" onClick={()=>setMoved(true)} className="mt-2.5 inline-flex min-h-8 w-full items-center justify-center gap-1 rounded-lg bg-[#c8ff93] px-2 text-[10px] font-bold text-[#122616] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">{t("Mark done")} <CheckCircle2 className="h-3.5 w-3.5" aria-hidden/></button>}
              {item.id==='w6'&&moved&&<><p className="mt-2 text-[9px] font-bold text-[#baff95]" role="status">{t("Demo completed")}</p>
                <button type="button" onClick={()=>setMoved(false)} className="mt-2 min-h-8 w-full rounded-lg border border-[#6f9c80] text-[10px] font-semibold text-[#d1ffcf] hover:bg-[#2c4737]">{t("Reset demo")}</button></>}
            </div>)}
            {items.length===0&&<div className="flex min-h-[190px] flex-col items-center justify-center rounded-xl border border-dashed border-[#3b5057] px-3 text-center">
              <CheckCircle2 className="mb-2 h-5 w-5 text-[#4c9182]" aria-hidden/><p className="text-[10px] font-semibold text-[#b9c8ce]">{t("No Actions in this stage")}</p>
              <p className="mt-2 text-[9px] leading-4 text-[#859ba2]">{t("Move an Action here as work progresses.")}</p>
            </div>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
function LayersIcon(){return <LayoutGrid className="mr-1 inline h-3 w-3 text-[#bdff9f]" aria-hidden/>;}

function PlannerPanel(){
  const t=useT();
  const [view,setView]=useState<'Today'|'Calendar'|'Routines'>('Today');
  const [done,setDone]=useState<string[]>([]);
  const [draft,setDraft]=useState('');
  const [added,setAdded]=useState<string[]>([]);
  const items=[
    {id:'p1',name:'Review campaign creative',time:'09:30',type:'Checklist',detail:'Launch campaign'},
    {id:'p2',name:'Prepare product demo',time:'11:15',type:'Action',detail:'Product launch'},
    {id:'p3',name:'Follow up with pilot customers',time:'14:00',type:'Checklist',detail:'Customer success'},
    ...added.map((title,i)=>({id:'added'+i,name:title,time:'Today',type:'Checklist',detail:'Quick capture'})),
  ];
  return <div className="min-w-0">
    <MiniHeader title={t("Planner")} subtitle="Shape the day, protect your time, and keep recurring work moving." Icon={CalendarDays}/>
    <div className="m-3 rounded-[15px] border border-[#31444e] bg-[#19252d] p-3 sm:m-4">
      <div className="flex items-center justify-between gap-2">
        <div><p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#c8ff93]">{t("QUICK CAPTURE")}</p><p className="mt-1 text-[10px] text-[#a2b5bc]">{t("Add a small step to today’s plan.")}</p></div>
        <span className="rounded-lg border border-[#3c504b] px-2 py-1 text-[9px] font-semibold text-[#c8ff93]">{t("Checklist item")}</span>
      </div>
      <form onSubmit={event=>{event.preventDefault();if(draft.trim()){setAdded(items=>[...items,draft.trim().slice(0,65)]);setDraft('');setView('Today');}}} className="mt-3 flex gap-2">
        <input aria-label={t("Sample quick capture")} value={draft} maxLength={65} onChange={event=>setDraft(event.target.value)}
          placeholder={t("e.g. Review the new campaign brief...")} className="min-w-0 flex-1 rounded-lg border border-[#344650] bg-[#111b22] px-3 py-2.5 text-[11px] text-white placeholder:text-[#8298a1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]"/>
        <button type="submit" disabled={!draft.trim()} aria-label={t("Add sample checklist item")} className="rounded-lg bg-[#c8ff93] px-3 text-[#122519] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" aria-hidden/></button>
      </form>
    </div>
    <div className="mx-3 mb-3 inline-flex flex-wrap gap-1 rounded-xl border border-[#33444a] bg-[#121d22] p-1 sm:mx-4" role="tablist" aria-label={t("Planner demo views")}>
      {(['Today','Calendar','Routines'] as const).map(item=><button role="tab" aria-selected={item===view} key={item} type="button" onClick={()=>setView(item)}
        className={'rounded-lg px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] '+(item===view?'bg-[#25353f] text-white':'text-[#a4b5bd] hover:text-white')}>{t(item)}</button>)}
    </div>
    {view==='Today'&&<div className="mx-3 mb-4 space-y-2 sm:mx-4">
      <p className={'mb-1 '+smallLabel}>TODAY · {items.length} PLANNED</p>
      {items.map(item=><button key={item.id} type="button" aria-pressed={done.includes(item.id)}
        onClick={()=>setDone(curr=>curr.includes(item.id)?curr.filter(id=>id!==item.id):[...curr,item.id])}
        className="flex w-full items-center gap-3 rounded-xl border border-[#303f49] bg-[#19242b] px-3.5 py-3 text-left transition hover:border-[#5e8671] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
        <span className={'flex h-4 w-4 shrink-0 items-center justify-center rounded border '+(done.includes(item.id)?'border-[#c8ff93] bg-[#c8ff93] text-[#102416]':'border-[#a0cba4]')} aria-hidden>{done.includes(item.id)&&<Check className="h-3 w-3"/>}</span>
        <span className="min-w-0 flex-1"><span className={'block truncate text-[11px] font-semibold '+(done.includes(item.id)?'text-[#91aca4] line-through':'text-[#f7fcfc]')}>{t(item.name)}</span><span className="mt-1 block truncate text-[9px] text-[#8fa6ac]">{t(item.type)} · {t(item.detail)}</span></span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] text-[#bbcdd1]"><Clock3 className="h-3 w-3" aria-hidden/>{t(item.time)}</span>
      </button>)}
    </div>}
    {view==='Calendar'&&<div className="mx-3 mb-4 rounded-xl border border-[#34434c] bg-[#152128] p-3 sm:mx-4">
      <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-white">{t("Your week, in focus")}</p><span className="text-[9px] text-[#a6bec4]">{t("Sample week")}</span></div>
      <div className="mt-3 grid grid-cols-5 gap-1">
        {['Mon 09','Tue 10','Wed 11','Thu 12','Fri 13'].map((day,i)=><div key={day} className={'rounded-lg border px-1 py-3 text-center text-[9px] '+(i===2?'border-[#93ca8b] bg-[#2c5144] text-[#d3ffcf]':'border-[#34454b] bg-[#1e2d35] text-[#bfd0d6]')}>{t(day)}</div>)}
      </div>
      <div className="mt-3 space-y-2">
        {[['09:30','Campaign review','Review'],['11:15','Product demo','Work'],['14:00','Customer follow-up','Follow-up']].map(([time,title,tag])=>
          <div key={time} className="flex gap-2 text-[10px]"><span className="w-10 pt-2 text-[#98adb5]">{time}</span><div className="flex-1 rounded-lg border border-[#426659] bg-[#27483d] px-3 py-2"><span className="font-semibold text-[#f3fbf6]">{t(title)}</span><span className="ml-2 text-[#abcfb6]">{t(tag)}</span></div></div>)}
      </div>
    </div>}
    {view==='Routines'&&<div className="mx-3 mb-4 space-y-2 sm:mx-4">
      <p className={'mb-1 '+smallLabel}>{t("RECURRING WORK")}</p>
      {[['Monday planning','Every Monday','09:00'],['Customer check-ins','Every Wednesday','14:30'],['Weekly wrap-up','Every Friday','16:00']].map(([name,frequency,time])=>
        <div key={name} className="flex items-center gap-3 rounded-xl border border-[#34434c] bg-[#1a272e] p-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#253a34] text-[#c6fb97]"><Workflow className="h-4 w-4" aria-hidden/></span>
          <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-white">{t(name)}</p><p className="mt-1 text-[9px] text-[#a2b9c0]">{t(frequency)}</p></div>
          <span className="text-[10px] text-[#bdcfd2]">{time}</span>
        </div>)}
    </div>}
  </div>;
}

function KnowledgePanel({query}:{query:string}){
  const t=useT();
  const locale=useContext(MarketingLocaleContext);
  const [view,setView]=useState<'Overview'|'Notes'|'Checklists'|'Pinned'>('Overview');
  const [pinned,setPinned]=useState<string[]>(['n4']);
  const filtered=notes.filter(n=>
    (view==='Overview'||(view==='Pinned'?pinned.includes(n.id):n.type===view)) &&
    (!query||[n.title,n.detail,n.context].some(text=>text.toLowerCase().includes(query.toLowerCase())||t(text).toLocaleLowerCase(locale==='tr'?'tr-TR':'en-US').includes(query.toLocaleLowerCase(locale==='tr'?'tr-TR':'en-US')))));
  return <div className="min-w-0">
    <MiniHeader title={t("Knowledge Hub")} subtitle="Find important notes, decisions and checklists in one connected place." Icon={BookOpen}/>
    <div className="grid grid-cols-2 gap-2 border-b border-[#2c3c43] px-3 py-3 sm:grid-cols-4 sm:px-4">
      {[['36','Knowledge entries'],['18','Notes'],['68','Checklist items'],[String(pinned.length),'Pinned']].map(([value,label])=>
        <div key={t(label)} className="rounded-xl border border-[#32444b] bg-[#1c2a31] p-2.5 sm:p-3">
          <p className="text-[17px] font-bold tracking-[-.045em] text-white">{value}</p><p className="mt-1 truncate text-[9px] text-[#a7bec3]">{t(label)}</p>
        </div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2d3d44] px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={t("Knowledge demo filters")}>
        {(['Overview','Notes','Checklists','Pinned'] as const).map(label=>
          <button type="button" role="tab" aria-selected={view===label} onClick={()=>setView(label)} key={t(label)}
            className={'rounded-lg px-2.5 py-2 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] '+(view===label?'bg-[#c8ff93] text-[#13261b]':'text-[#b2c8c8] hover:bg-[#2d3d44] hover:text-white')}>{t(label)}</button>)}
      </div>
      <span className="text-[9px] text-[#8fa6b1]">{filtered.length} matching entries</span>
    </div>
    <div className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
      {filtered.map(note=><article key={note.id} className="relative min-w-0 rounded-[13px] border border-[#38474f] bg-[#202b31] p-3.5 transition hover:border-[#68836c]">
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#34354b] px-2 py-1 text-[9px] font-semibold text-[#c5bbff]"><BookOpen className="h-3 w-3" aria-hidden/>{t(note.type)}</span>
          <button type="button" onClick={()=>setPinned(curr=>curr.includes(note.id)?curr.filter(id=>id!==note.id):[...curr,note.id])}
            aria-label={t(pinned.includes(note.id)?'Unpin ':'Pin ')+t(note.title)} aria-pressed={pinned.includes(note.id)}
            className={'rounded-lg border p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] '+(pinned.includes(note.id)?'border-[#b1b95c] bg-[#373d2e] text-[#c8ff93]':'border-[#3e5155] text-[#b3c7cb] hover:text-[#c8ff93]')}>
            <Star className={'h-3.5 w-3.5 '+(pinned.includes(note.id)?'fill-current':'')} aria-hidden/>
          </button>
        </div>
        <h4 className="mt-3 text-[11px] font-bold leading-5 text-white">{t(note.title)}</h4>
        <p className="mt-1.5 line-clamp-2 text-[10px] leading-[1.7] text-[#aec2c8]">{t(note.detail)}</p>
        <div className="mt-3 flex items-center gap-1.5 border-t border-[#3c4f54] pt-2.5 text-[9px] text-[#9bb3b5]"><FolderOpen className="h-3 w-3" aria-hidden/><span className="truncate">{t(note.context)}</span><span className="ml-auto shrink-0">{t(note.count)}</span></div>
      </article>)}
      {!filtered.length&&<div className="col-span-full rounded-xl border border-dashed border-[#43585e] p-7 text-center"><Search className="mx-auto mb-2 h-5 w-5 text-[#8caeab]" aria-hidden/><p className="text-[11px] text-[#c2d4d3]">{t("No matching knowledge entries")}</p></div>}
    </div>
  </div>;
}

function AIPanel(){
  const t=useT();
  const [question,setQuestion]=useState<'priorities'|'summary'>('priorities');
  return <div className="min-w-0"><MiniHeader title={t("Actiproc AI")} subtitle="Your workspace intelligence, connected to real context when authorized." Icon={Sparkles}/>
    <div className="p-4 sm:p-6"><div className="mx-auto max-w-xl space-y-3">
      <div className="ml-auto max-w-[88%] rounded-2xl border border-[#47715b] bg-[#263b35] px-4 py-3 text-[11px] text-[#f0f8f5]">{t(question==='priorities'?'What should our team focus on this week?':'Summarize our launch progress.')}</div>
      <div className="rounded-2xl border border-[#3c4c54] bg-[#1d2a30] p-4">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold text-white"><Sparkles className="h-4 w-4 text-[#c8ff93]" aria-hidden/>{t("Actiproc AI · Workspace assistant")}</p>
        <p className="mt-3 text-[11px] leading-6 text-[#c2d2d6]">{t(question==='priorities'?'Based on this sample workspace, review the onboarding flow first, then complete the launch checklist and move the partner proposal into review.':'This fictional workspace has 10 sample Actions across six workflow stages. The next priority is finishing in-progress launch work.')}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{['Product launch','Sample work context'].map(tag=><span key={tag} className="rounded-full border border-[#4a665c] bg-[#243b35] px-2 py-1 text-[9px] text-[#bde6c2]">{t(tag)}</span>)}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={()=>setQuestion('priorities')} aria-pressed={question==='priorities'} className="rounded-lg border border-[#49635b] px-3 py-2 text-[10px] text-[#d5f0da] hover:bg-[#2b4038]">{t("Priorities")}</button>
        <button type="button" onClick={()=>setQuestion('summary')} aria-pressed={question==='summary'} className="rounded-lg border border-[#49635b] px-3 py-2 text-[10px] text-[#d5f0da] hover:bg-[#2b4038]">{t("Summary")}</button>
      </div>
      <p className="text-[10px] text-[#92aab2]">{t("Illustrative AI response. Not a live model call. Plan limits and service availability apply.")}</p>
    </div></div>
  </div>;
}
function InsightsPanel(){
  const t=useT();
  return <div className="min-w-0"><MiniHeader title={t("Workspace insights")} subtitle="Know where progress is happening and where work is waiting." Icon={BarChart3}/>
    <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-4 sm:p-4">
      {[['68%','Completion rate'],['12','This week'],['02','Needs review'],['05','Active projects']].map(([value,name])=><div key={name} className={surface+' p-3'}><p className="text-[20px] font-bold text-[#f7fdfd]">{value}</p><p className="mt-1 text-[9px] text-[#afc1c4]">{t(name)}</p></div>)}
      <div className={surface+' col-span-2 p-4 sm:col-span-3'}>
        <p className="text-[11px] font-semibold text-white">{t("Completion velocity · sample weeks")}</p>
        <div className="mt-6 flex h-32 items-end gap-2 border-b border-[#40515a]" aria-label={t("Decorative simulated weekly progress chart")}>
          {[24,38,35,55,47,65,53,78,69,91,74,86].map((v,i)=><span key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-[#2c665f] to-[#bcff92]" style={{height:v+'%'}}/>)}
        </div>
      </div><div className={surface+' col-span-2 p-4 sm:col-span-1'}>
        <p className="text-[11px] font-semibold text-white">{t("Priority mix")}</p>
        <div className="mx-auto mt-6 h-24 w-24 rounded-full border-[17px] border-[#f0b523] border-l-[#4d9c78] border-t-[#7691e4]" aria-hidden/>
        <p className="mt-4 text-center text-[10px] text-[#acc2c4]">{t("Illustrative metrics")}</p>
      </div>
    </div></div>;
}
function TeamPanel(){
  const t=useT();
  return <div className="min-w-0"><MiniHeader title={t("Northstar Studio")} subtitle="Your team's shared workspace, tasks and customer context." Icon={Users}/>
    <div className="space-y-3 p-3 sm:p-5"><div className={surface+' p-4'}><p className="text-[11px] font-semibold text-white">{t("Shared product launch")}</p><p className="mt-2 text-[10px] leading-5 text-[#b5c4c7]">{t("Team ownership and customer context stay connected to each Action.")}</p></div>
      {[['Customer launch readiness','Customer success','In progress'],['Website refresh','Design','Review'],['Release retrospective','Product','Completed']].map(([name,team,status])=><div key={name} className={surface+' flex items-center gap-3 p-3.5'}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2b4b40] text-[#c8ff93]"><Users className="h-4 w-4" aria-hidden/></span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-white">{t(name)}</p><p className="mt-1 text-[10px] text-[#9cb2ba]">{t(team)}</p></div><span className="text-[9px] text-[#bde6ca]">{t(status)}</span></div>)}
      <p className="text-[10px] text-[#96adb5]">{t("Fictional team and customer information.")}</p>
    </div></div>;
}

export function MarketingWorkspacePreview({locale='en'}:{locale?:MarketingLocale}){
  const t=marketingT(locale);
  const [selected,setSelected]=useState<PreviewTab>('board');
  const [moved,setMoved]=useState(false);
  const [created,setCreated]=useState(false);
  const [query,setQuery]=useState('');
  return <MarketingLocaleContext.Provider value={locale}><div className="ap-preview-outer">
    <div className="ap-preview-window ap-real-window">
      <div className="ap-real-browser flex h-9 items-center gap-2 border-b border-[#35454e] bg-[#1e2c2f] px-3 sm:h-11 sm:px-4">
        <span className="flex gap-1.5" aria-hidden><i className="h-2 w-2 rounded-full bg-[#e17e7e]"/><i className="h-2 w-2 rounded-full bg-[#ddbd80]"/><i className="h-2 w-2 rounded-full bg-[#6bb9a2]"/></span>
        <span className="mx-auto truncate text-[10px] text-[#a8bcb8]">actiproc.com / northstar-studio / {selected==='notes'?'knowledge':selected}</span>
        <ArrowUpRight className="h-3.5 w-3.5 text-[#9cafb7]" aria-hidden/>
      </div>
      <div className="ap-real-app">
        <aside className="ap-real-sidebar border-r border-[#303f47] bg-[#131e23] p-2 sm:p-3">
          <div className="mb-5 flex items-center gap-2 px-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#c8ff93] text-[#183124]"><LayoutGrid className="h-4 w-4" aria-hidden/></span>
            <span className="hidden text-xs font-bold text-white sm:block">Actiproc</span>
          </div>
          <div className="mb-3 hidden rounded-xl border border-[#34444b] bg-[#1b2b30] p-2.5 sm:block"><p className="truncate text-[10px] font-semibold text-white">{t("Northstar Studio")}</p><p className="mt-1 text-[9px] text-[#9cb6b4]">{t("Sample team workspace")}</p></div>
          <nav className="space-y-1" aria-label={t("Product demonstration")}>
            {tabs.map(({key,label,Icon})=><button key={key} type="button" onClick={()=>{setSelected(key);setQuery('');}} title={t(label)}
              aria-label={t('Preview ')+t(label)} aria-pressed={selected===key}
              className={'flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] '+(selected===key?'bg-[#28443a] text-[#d7ffd0]':'text-[#a9bdc2] hover:bg-[#283a42] hover:text-white')}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden/><span className="hidden truncate sm:block">{t(label)}</span>
            </button>)}
          </nav>
          <div className="mt-5 hidden rounded-xl border border-[#354a45] bg-[#1b302c] p-2.5 sm:block"><p className="text-[9px] font-semibold text-[#c8ff93]">{t("One connected space")}</p><p className="mt-1 text-[9px] leading-4 text-[#9bb8b4]">{t("From idea to outcome.")}</p></div>
        </aside>
        <div className="ap-real-main min-w-0 bg-[#10191e]">
          <header className="flex min-h-11 items-center gap-2 border-b border-[#303e47] bg-[#172127] px-2 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#354750] bg-[#1b292f] px-2.5 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-[#a1b7bd]" aria-hidden/>
              <input value={query} onChange={event=>setQuery(event.target.value)} aria-label={t("Search the sample workspace")}
                placeholder={t("Search sample work and knowledge...")} className="min-w-0 flex-1 bg-transparent text-[10px] text-[#eef7f5] placeholder:text-[#96aab1] focus-visible:outline-none"/>
            </div>
            <button type="button" onClick={()=>{setSelected('board');setQuery('');setCreated(!created);}} aria-label={t(created?'Remove sample Action':'Add sample Action')}
              className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#c8ff93] px-2 text-[10px] font-bold text-[#142717] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
              {created?<Check className="h-3.5 w-3.5" aria-hidden/>:<Plus className="h-3.5 w-3.5" aria-hidden/>}
              <span className="hidden sm:inline">{t(created?'Added':'Add Action')}</span>
            </button>
            <Bell className="hidden h-4 w-4 text-[#bed0d4] md:block" aria-hidden/>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3f5f55] text-[9px] font-bold text-[#f3ffe6]">NS</span>
          </header>
          <div className="ap-real-content min-w-0 overflow-y-auto">
            {selected==='board'&&<BoardPanel moved={moved} setMoved={setMoved} created={created} query={query}/>}
            {selected==='planner'&&<PlannerPanel/>}
            {selected==='notes'&&<KnowledgePanel query={query}/>}
            {selected==='ai'&&<AIPanel/>}
            {selected==='insights'&&<InsightsPanel/>}
            {selected==='team'&&<TeamPanel/>}
          </div>
        </div>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-[#9bb0a6] sm:text-[11px]">
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#c8ff93]" aria-hidden/>{t("Interactive product walkthrough")}</span>
      <span>{t("Illustrative workspace · not live user data")}</span>
    </div>
  </div></MarketingLocaleContext.Provider>;
}
