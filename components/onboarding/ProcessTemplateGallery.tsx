'use client';

import {useMemo,useState} from 'react';
import {ArrowUpRight, BriefcaseBusiness, CalendarDays, ChevronRight, Headphones, Layers3, Rocket, Search, Target, UsersRound} from 'lucide-react';
import {PROCESS_TEMPLATES, type ProcessTemplateId, type TemplateCategory} from '@/lib/process-template-catalog';

const icons={rocket:Rocket,briefcase:BriefcaseBusiness,calendar:CalendarDays,users:UsersRound,
  headphones:Headphones,target:Target,layers:Layers3,search:Search} as const;
type Filter='All'|TemplateCategory;

export function ProcessTemplateGallery({onChoose,disabled=false}:{
  onChoose:(id:ProcessTemplateId)=>void;disabled?:boolean;
}) {
  const [filter,setFilter]=useState<Filter>('All');
  const [query,setQuery]=useState('');
  const visible=useMemo(()=>PROCESS_TEMPLATES.filter(t=>
    (filter==='All'||t.category===filter)&&
    [t.title,t.description,t.outcome,t.category].some(v=>v.toLowerCase().includes(query.trim().toLowerCase()))
  ),[filter,query]);

  return <section aria-labelledby="p1-template-heading" className="space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.14em] text-primary">
          <Layers3 className="h-3.5 w-3.5" aria-hidden="true"/> Starter library
        </div>
        <h2 id="p1-template-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">Start with a proven structure</h2>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">Choose a starting point, adjust every stage, and create your own Process. No sample tasks are added to your workspace.</p>
      </div>
      <div className="relative min-w-0 sm:w-60">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true"/>
        <input aria-label="Search process templates" value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Search templates" className="h-10 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
      </div>
    </div>
    <div role="group" aria-label="Template categories" className="flex flex-wrap gap-2">
      {(['All','Personal','Team','Business'] as const).map(category=>
        <button type="button" key={category} aria-pressed={filter===category} onClick={()=>setFilter(category)}
          className={'rounded-full border px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring '+
            (filter===category?'border-primary bg-primary text-primary-foreground':'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground')}>
          {category}
        </button>)}
    </div>
    {visible.length===0?<div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No matching templates. Try another category or search.</div>:
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {visible.map(item=>{
        const Icon=icons[item.icon];
        return <button key={item.id} type="button" disabled={disabled} onClick={()=>onChoose(item.id)}
          className="group flex min-h-[230px] flex-col rounded-[20px] border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/10 bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true"/></span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{item.category}</span>
          </div>
          <p className="mt-4 text-base font-semibold tracking-tight">{item.title}</p>
          <p className="mt-1.5 flex-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
          <div className="mt-4 flex flex-wrap gap-1">
            {item.stages.slice(0,4).map((stage,i)=><span key={i} className={'rounded-md px-2 py-1 text-[10px] font-medium '+(stage.isTerminal?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':'bg-muted text-muted-foreground')}>{stage.title}</span>)}
            {item.stages.length>4?<span className="rounded-md bg-muted px-2 py-1 text-[10px]">+{item.stages.length-4}</span>:null}
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs font-semibold text-primary">
            <span>{item.recommended?'Recommended · ':'Use template'}{item.recommended?'Use template':''}</span>
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true"/>
          </div>
        </button>;
      })}
    </div>}
  </section>;
}
