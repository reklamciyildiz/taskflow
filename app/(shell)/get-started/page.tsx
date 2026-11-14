'use client';

import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeft,ArrowRight,BookOpen,Compass,Layers3,Lightbulb} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {FirstSuccessJourney} from '@/components/onboarding/FirstSuccessJourney';
import {SampleWorkspace} from '@/components/onboarding/SampleWorkspace';
import type {ProcessTemplateId} from '@/lib/process-template-catalog';

export default function GettingStartedPage(){
  const router=useRouter();
  const useTemplate=(id:ProcessTemplateId)=>
    router.push(`/dashboard/processes?template=${encodeURIComponent(id)}`);
  return <div className="mx-auto w-full max-w-[1460px] space-y-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
    <header className="relative overflow-hidden rounded-[28px] border bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-9">
      <div className="relative z-10 max-w-3xl space-y-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5"/> Back to dashboard
        </Link>
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em] text-primary">
          <Compass className="h-4 w-4"/> Actiproc · Getting started
        </span>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your work, connected from day one.</h1>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
          Explore without risk, choose a Process structure, then complete one real Action.
          No automatic data imports, fictitious achievements or hidden account changes.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={()=>document.getElementById('p1-sample-workspace')?.scrollIntoView({behavior:'smooth',block:'start'})} variant="outline" className="gap-2">
            <BookOpen className="h-4 w-4"/> Try sample workspace
          </Button>
          <Button onClick={()=>router.push('/dashboard/processes')} className="gap-2">
            <Layers3 className="h-4 w-4"/> Browse Process templates <ArrowRight className="h-4 w-4"/>
          </Button>
        </div>
      </div>
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full border-[40px] border-primary/5"/>
    </header>
    <FirstSuccessJourney />
    <div id="p1-sample-workspace" className="scroll-mt-24"><SampleWorkspace onUseTemplate={useTemplate}/></div>
    <div className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary"/>
        <div>
          <h2 className="text-sm font-semibold">Prefer to start from a real project?</h2>
          <p className="mt-1 max-w-xl text-xs leading-6 text-muted-foreground">
            Templates only define Process stages. When you create a Process it follows the same permissions and plan limits as any other Process.
          </p>
        </div>
      </div>
      <Button variant="outline" asChild><Link href="/dashboard/processes">Explore all templates <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
    </div>
  </div>;
}
