'use client';

import {useMemo,useState} from 'react';
import {ArrowRight,CheckCircle2,MousePointerClick,RotateCcw,ShieldCheck,Sparkles} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {getProcessTemplate,PROCESS_TEMPLATES,type ProcessTemplateId} from '@/lib/process-template-catalog';

type DemoTask={id:number;title:string;stage:number;note:string};
const exampleTasks:readonly DemoTask[]=[
 {id:1,title:'Review customer feedback',stage:0,note:'Identify the most common needs'},
 {id:2,title:'Prepare launch checklist',stage:1,note:'Finalize the release criteria'},
 {id:3,title:'Review landing copy',stage:2,note:'Check the final message'},
 {id:4,title:'Publish help articles',stage:3,note:'Share the finished documentation'},
];

export function SampleWorkspace({onUseTemplate}:{onUseTemplate?:(id:ProcessTemplateId)=>void}) {
  const [templateId,setTemplateId]=useState<ProcessTemplateId>('product-launch');
  const [tasks,setTasks]=useState<DemoTask[]>(()=>exampleTasks.map(t=>({...t})));
  const template=getProcessTemplate(templateId)!;
  const columns=template.stages;
  const inColumns=useMemo(()=>columns.map((stage,index)=>({
    stage,index,tasks:tasks.filter(t=>t.stage===index)
  })),[columns,tasks]);
  const move=(id:number,stage:number)=>setTasks(prev=>prev.map(t=>t.id===id?{...t,stage}:t));
  const switchExample=(id:ProcessTemplateId)=>{setTemplateId(id);setTasks(exampleTasks.map(t=>({...t,stage:Math.min(t.stage,getProcessTemplate(id)!.stages.length-1)})));};
  return <section aria-labelledby="p1-sample-heading" className="overflow-hidden rounded-[28px] border bg-card shadow-sm">
    <div className="border-b bg-gradient-to-br from-primary/10 via-background to-background px-5 py-6 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-[10px] font-bold uppercase tracking-[.15em] text-primary"><ShieldCheck className="h-3.5 w-3.5"/> Safe demo · No data saved</span>
          <h2 id="p1-sample-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">Explore a sample workspace</h2>
          <p className="text-sm leading-6 text-muted-foreground">Try moving Actions from one stage to another. This is a private, temporary preview — no Process, Action or customer record is created.</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={()=>switchExample(templateId)}>
          <RotateCcw className="h-4 w-4"/> Reset preview
        </Button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label htmlFor="p1-demo-template" className="text-xs font-semibold">Demo workflow</label>
        <select id="p1-demo-template" value={templateId} onChange={e=>switchExample(e.target.value as ProcessTemplateId)}
          className="h-10 max-w-full rounded-xl border bg-card px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {PROCESS_TEMPLATES.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}
        </select>
      </div>
    </div>
    <div className="relative overflow-x-auto px-4 py-5 sm:px-6">
      <div className="flex min-w-max gap-3 pb-2">
        {inColumns.map(({stage,index,tasks:bucket})=><div key={index} className="w-[225px] shrink-0 space-y-3 rounded-2xl border bg-muted/30 p-3 sm:w-[244px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">{stage.title}</span>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-background px-1.5 text-xs font-semibold">{bucket.length}</span>
          </div>
          {bucket.length===0?<div className="rounded-xl border border-dashed bg-background/40 px-3 py-5 text-center text-xs text-muted-foreground">No sample Actions</div>:bucket.map(task=>
            <div key={task.id} className="rounded-xl border bg-background p-3 shadow-sm">
              <span className="mb-2 inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                {stage.isTerminal?<CheckCircle2 className="h-3 w-3 text-emerald-600"/>:<Sparkles className="h-3 w-3 text-primary"/>} Sample Action
              </span>
              <p className="text-sm font-semibold leading-5">{task.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.note}</p>
              <div className="mt-3 border-t pt-3">
                <label htmlFor={`sample-move-${task.id}`} className="mb-1 block text-[10px] font-semibold text-muted-foreground">Move to stage</label>
                <select id={`sample-move-${task.id}`} value={task.stage} onChange={event=>move(task.id,Number(event.target.value))}
                  className="h-9 w-full rounded-lg border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {columns.map((target,i)=><option key={i} value={i}>{target.title}</option>)}
                </select>
              </div>
            </div>)}
        </div>)}
      </div>
    </div>
    <div className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><MousePointerClick className="h-4 w-4"/> Everything above is illustrative and resets when you leave.</span>
      {onUseTemplate?<Button onClick={()=>onUseTemplate(templateId)} className="gap-2">Use this structure <ArrowRight className="h-4 w-4"/></Button>:null}
    </div>
  </section>;
}
