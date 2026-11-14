'use client';

import Link from 'next/link';
import {ArrowRight,Check,CheckCircle2,Compass,Layers3,Plus,Trophy,X} from 'lucide-react';
import {useMemo} from 'react';
import {useTaskContext} from '@/components/TaskContext';
import {calculateFirstSuccessProgress} from '@/lib/onboarding/first-success';
import {Button} from '@/components/ui/button';

export function useFirstSuccessProgress(){
  const {projects,tasks,currentTeam,loading}=useTaskContext();
  return useMemo(()=>({
    ...calculateFirstSuccessProgress({
      projects,tasks,teamId:currentTeam?.id??null,
    }),
    loading,
  }),[projects,tasks,currentTeam?.id,loading]);
}

export function FirstSuccessJourney({compact=false,onDismiss}:{compact?:boolean;onDismiss?:()=>void}){
  const p=useFirstSuccessProgress();
  const {currentUserRole}=useTaskContext();
  const admin=currentUserRole==='admin';
  const steps=[
    {done:p.processCount>0,title:'Create your first Process',description:'Choose a ready-made workflow or define your own stages.',
      href:'/dashboard/processes',action:'Browse templates',icon:Layers3},
    {done:p.taskCount>0,title:'Add a real Action',description:'Capture one piece of work inside the Process you created.',
      href:p.projectId?`/board?project=${encodeURIComponent(p.projectId)}`:'/dashboard/processes',
      action:'Open your board',icon:Plus},
    {done:p.hasCompletedAction,title:'Close your first Action',description:'Move an Action into the terminal stage in your Process.',
      href:p.projectId?`/board?project=${encodeURIComponent(p.projectId)}`:'/dashboard/processes',
      action:'Finish an Action',icon:CheckCircle2}
  ];
  if(p.loading)return <div aria-label="Loading getting started progress" className="h-28 animate-pulse rounded-2xl border bg-muted/30"/>;
  return <section aria-labelledby={compact?'p1-journey-small':'p1-journey-large'}
    className="overflow-hidden rounded-[24px] border bg-card shadow-sm">
    <div className={'bg-gradient-to-br from-primary/10 via-background to-background '+(compact?'p-4 sm:p-5':'p-5 sm:p-7')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-primary"><Compass className="h-3.5 w-3.5"/> Your first win</span>
          <h2 id={compact?'p1-journey-small':'p1-journey-large'} className={'font-semibold tracking-tight '+(compact?'text-lg':'text-2xl')}>
            {p.complete?'Your first workflow is running':'From a blank page to finished work'}
          </h2>
          <p className="max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
            {p.complete?'You have a Process, an Action, and a completed step — all from your actual workspace.':
              'Three simple steps using real work. No pretend tasks, badges or inflated progress.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {compact&&onDismiss?<button type="button" onClick={onDismiss} aria-label="Dismiss getting started" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-background text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-4 w-4"/></button>:null}
        <div aria-label={`${p.count} of 3 steps completed`} className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-primary/10 px-3 text-base font-bold text-primary">
          {p.count}/3
        </div>
        </div>
      </div>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={p.count} aria-valuemin={0} aria-valuemax={3} aria-label="Getting started progress">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{width:`${p.count/3*100}%`}}/>
      </div>
    </div>
    <div className={'grid gap-3 '+(compact?'p-4 sm:grid-cols-3 sm:p-5':'p-5 sm:grid-cols-3 sm:p-6')}>
      {steps.map((step,i)=><div key={i} className={'rounded-2xl border p-4 '+(step.done?'border-emerald-500/20 bg-emerald-500/[.05]':'bg-background')}>
        <div className="flex items-center justify-between">
          <span className={'inline-flex h-9 w-9 items-center justify-center rounded-xl '+(step.done?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400':'bg-muted text-muted-foreground')}>
            {step.done?<Check className="h-4 w-4"/>:<step.icon className="h-4 w-4"/>}
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">STEP 0{i+1}</span>
        </div>
        <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
        <p className="mt-1 min-h-[36px] text-xs leading-5 text-muted-foreground">{step.description}</p>
        {step.done?<p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5"/> Completed</p>:
          (i===0&&!admin?<p className="mt-3 text-xs text-muted-foreground">A workspace admin creates Processes. You can explore the sample workspace below.</p>:
            <Link href={step.href} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {step.action}<ArrowRight className="h-3.5 w-3.5"/>
            </Link>)}
      </div>)}
    </div>
    {p.complete&&!compact?<p className="flex items-center gap-2 border-t px-6 py-4 text-xs text-muted-foreground"><Trophy className="h-4 w-4 text-primary"/> Based on saved workspace data. You can now continue building your own process.</p>:null}
  </section>;
}
