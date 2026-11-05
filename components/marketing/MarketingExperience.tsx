import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, BarChart3, BellRing, BookOpenText,
  CalendarDays, CheckCircle2, Cloud, Fingerprint, Layers3,
  ListChecks, Network, NotebookPen, PanelLeft, Sparkles, Users, Webhook,
} from 'lucide-react';
import { MarketingWorkspacePreview } from './MarketingWorkspacePreview';

const linkStyle = 'inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl px-6 text-[13px] font-semibold transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1326] active:scale-[0.98] sm:text-sm';

const workflow = [
  {
    index: '01', icon: NotebookPen, title: 'Capture the thought.',
    body: 'Collect incoming work before it disappears. Turn it into an Action you can actually move forward.',
    tag: 'Capture',
  },
  {
    index: '02', icon: Layers3, title: 'Give it a process.',
    body: 'Make the stages fit your workflow. See ownership, priority and progress in a single view.',
    tag: 'Structure',
  },
  {
    index: '03', icon: ListChecks, title: 'Make progress visible.',
    body: 'Keep checklists, notes, attachments and next steps together inside the same Action.',
    tag: 'Execute',
  },
  {
    index: '04', icon: BookOpenText, title: 'Keep what you learn.',
    body: 'Move from finished work to reusable knowledge, decisions and a clearer way of working.',
    tag: 'Remember',
  },
] as const;

const productCapabilities = [
  { icon: Columns3Icon, title: 'Processes & Boards', sub: 'A workflow that fits the work',
    description: 'Organize Actions in custom stages, move work across a board, then switch to a list when you need focus.',
    tags: ['Custom stages', 'Board & list', 'Priorities'] },
  { icon: CalendarDays, title: 'Planner & Calendar', sub: 'Your day without the chaos',
    description: 'Bring due dates, schedules and work together so the next important thing is never buried.',
    tags: ['Schedule', 'Reminders', 'Google Calendar · Pro+'] },
  { icon: BookOpenText, title: 'Notes & Knowledge Hub', sub: 'Context that stays useful',
    description: 'Write richer notes, attach them to Actions, and search what you learned without losing the original context.',
    tags: ['Rich notes', 'Checklists', 'Search'] },
  { icon: Sparkles, title: 'Actiproc AI', sub: 'Ask better questions of your workspace',
    description: 'Use an assistant to work with accessible context, find relevant work and draft changes for your review.',
    tags: ['Contextual answers', 'Source references', 'Approval before changes'] },
] as const;

function Columns3Icon({className}: {className?: string}) {
  return <PanelLeft className={className} aria-hidden />;
}

const ecosystem = [
  { icon: Users, title: 'Teams & roles', copy: 'Shared workspaces, assignments and ownership with role-based access.' },
  { icon: BarChart3, title: 'Analytics & achievements', copy: 'Understand progress and celebrate meaningful milestones across your work.' },
  { icon: BellRing, title: 'Inbox & notifications', copy: 'Capture incoming work, revisit reminders and jump back to the Action that needs attention.' },
  { icon: Fingerprint, title: 'Workspace boundaries', copy: 'Organization-scoped access and permission checks across the product.' },
  { icon: Network, title: 'Customer workflows', copy: 'Keep customer context next to the work, decisions and people responsible for it.' },
  { icon: Cloud, title: 'Web & mobile', copy: 'Use the web app on smaller screens and install the supported PWA experience.' },
] as const;

function SectionLabel({number, children, light = false}: {number:string;children:React.ReactNode;light?:boolean}) {
  return (
    <div className={'inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.23em] sm:text-[11px] ' + (light ? 'text-[#5d6e88]' : 'text-[#a2bafa]')}>
      <span className={'inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 text-[9px] ' + (light ? 'border-[#bbc7d7] text-[#3f5b8a]' : 'border-[#42577f] text-[#a9c3ff]')}>{number}</span>
      {children}
    </div>
  );
}

export function MarketingHero() {
  return (
    <section className="ap-hero relative overflow-hidden pt-24 sm:pt-28 lg:pt-32" aria-labelledby="marketing-hero-title">
      <div aria-hidden className="ap-hero-glow pointer-events-none absolute inset-0" />
      <div aria-hidden className="ap-hero-grid pointer-events-none absolute inset-0" />
      <div className="relative z-10 mx-auto max-w-[1250px] px-5 sm:px-8 lg:px-10">
        <div className="grid min-w-0 items-start gap-11 lg:grid-cols-[minmax(0,.91fr)_minmax(0,1.09fr)] lg:gap-7 xl:gap-12">
          <div className="relative min-w-0 pt-2 lg:pt-12">
            <div className="ap-enter mb-8 inline-flex items-center gap-2 rounded-full border border-[#31456d] bg-[#182741]/75 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#b4caff] sm:text-[11px]">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 rounded-full bg-[#a9e4c6]" /></span>
              The connected workspace for real work
            </div>
            <h1 id="marketing-hero-title" className="ap-enter ap-display max-w-[790px] text-[clamp(3.25rem,7.1vw,6.5rem)] font-semibold leading-[0.99] tracking-[-0.065em] text-white" style={{animationDelay:'80ms'}}>
              Less noise.<br/>
              <span className="ap-headline-accent">More momentum.</span>
            </h1>
            <p className="ap-enter mt-7 max-w-[540px] text-[15px] leading-[1.9] text-[#acb9d0] sm:text-[17px]" style={{animationDelay:'150ms'}}>
              One place for everything between a good idea and finished work. Plan your day, move Actions through Processes, collaborate with your team and keep the knowledge behind every decision.
            </p>
            <div className="ap-enter mt-8 flex flex-wrap items-center gap-3" style={{animationDelay:'220ms'}}>
              <Link href="/auth/signup" className={linkStyle + ' bg-[#a9c4ff] text-[#0d1d39] shadow-[0_14px_55px_-24px_rgba(118,161,255,.85)] hover:-translate-y-0.5 hover:bg-[#c5d6ff] focus-visible:ring-[#b5cdff]'}>
                Start free <ArrowUpRight className="h-4 w-4" aria-hidden/>
              </Link>
              <Link href="#product" className={linkStyle + ' border border-[#354666] bg-white/[0.045] text-[#e5ecff] hover:-translate-y-0.5 hover:border-[#637aaa] hover:bg-white/[0.08] focus-visible:ring-[#b5cdff]'}>
                Explore the workspace <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="ap-enter mt-10 flex flex-wrap gap-x-5 gap-y-2.5 text-[11px] leading-5 text-[#8fa2c3]" style={{animationDelay:'270ms'}}>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[#9bd6b8]" aria-hidden /> Free plan available</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[#9bd6b8]" aria-hidden /> Designed for individuals & teams</span>
            </div>
          </div>
          <div className="ap-enter relative min-w-0 pb-10 lg:pb-0" style={{animationDelay:'180ms'}}>
            <div aria-hidden className="pointer-events-none absolute -inset-8 rounded-full bg-[#507ce3]/[0.13] blur-[80px]"/>
            <MarketingWorkspacePreview />
          </div>
        </div>
        <div className="relative mt-10 grid gap-4 border-t border-[#30405c]/65 py-7 sm:mt-16 sm:grid-cols-[155px_1fr] sm:items-center lg:mt-20">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9cb0d6]">Built around your day</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-medium text-[#d6e0f2] sm:justify-between">
            {['Capture','Plan','Execute','Remember','Improve'].map((word, i) => (
              <span key={word} className="inline-flex items-center gap-2">
                {i > 0 && <span className="hidden h-1 w-1 rounded-full bg-[#718cbd] sm:inline" aria-hidden />}
                {word}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketingWorkflow() {
  return (
    <section id="workflow" className="ap-light-section relative overflow-hidden py-24 sm:py-28 lg:py-36" aria-labelledby="ap-workflow-heading">
      <div className="mx-auto max-w-[1250px] px-5 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-24">
          <div>
            <SectionLabel number="01" light>One connected way to work</SectionLabel>
            <h2 id="ap-workflow-heading" className="ap-section-title mt-7 max-w-[580px] text-[#172440]">
              From scattered thoughts <span className="text-[#637a9d]">to work that moves.</span>
            </h2>
          </div>
          <div className="flex flex-col justify-end">
            <p className="max-w-[510px] text-[15px] leading-[1.9] text-[#5a6b86] sm:text-[17px]">
              Most tools solve one part of the problem. Actiproc connects the parts: an idea becomes an Action, the Action moves through a Process, and its notes become knowledge you can find again.
            </p>
            <Link href="#features" className="mt-5 inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#284d94] transition-colors hover:text-[#162f62] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6786c8]">
              See what connects <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="relative mt-14 grid gap-3 md:grid-cols-2 lg:mt-20 lg:grid-cols-4">
          <div aria-hidden className="pointer-events-none absolute left-8 right-8 top-11 hidden h-px bg-[#ced8e8] lg:block" />
          {workflow.map(step => {
            const Icon = step.icon;
            return <article key={step.index} className="relative rounded-[24px] border border-[#dce4ef] bg-white/[0.86] p-6 shadow-[0_18px_60px_-48px_rgba(39,58,94,.28)] sm:p-7">
              <div className="flex items-center justify-between">
                <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[15px] bg-[#eaf0fd] text-[#446fb3]">
                  <Icon className="h-[21px] w-[21px]" aria-hidden />
                </span>
                <span className="font-mono text-[11px] text-[#8c9cb4]">{step.index} / 04</span>
              </div>
              <p className="mt-9 text-[10px] font-semibold uppercase tracking-[0.19em] text-[#647fae]">{step.tag}</p>
              <h3 className="mt-3 text-[19px] font-semibold tracking-[-0.035em] text-[#1c2c47]">{step.title}</h3>
              <p className="mt-3 text-[13px] leading-[1.85] text-[#64738b]">{step.body}</p>
            </article>;
          })}
        </div>
      </div>
    </section>
  );
}

export function MarketingProductSystem() {
  return (
    <section id="product" className="ap-product-section relative overflow-hidden py-24 sm:py-28 lg:py-36" aria-labelledby="ap-product-heading">
      <div className="mx-auto max-w-[1250px] px-5 sm:px-8 lg:px-10">
        <SectionLabel number="02">The product</SectionLabel>
        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,.78fr)] md:items-end">
          <h2 id="ap-product-heading" className="ap-section-title max-w-[720px] text-white">
            Not another task list. <span className="text-[#93adf3]">An operating space.</span>
          </h2>
          <p className="max-w-[430px] text-[15px] leading-[1.9] text-[#97a9c8]">
            Fewer context switches. A coherent system where planning, execution and knowledge stay connected to the same work.
          </p>
        </div>
        <div id="features" className="mt-12 grid scroll-mt-24 gap-3 md:grid-cols-2 lg:mt-16">
          {productCapabilities.map((feature, index) => {
            const Icon = feature.icon;
            return <article key={feature.title} className={'ap-capability relative flex min-h-[310px] min-w-0 flex-col overflow-hidden rounded-[26px] border border-[#324365] p-6 sm:p-8 ' + (index === 0 ? 'ap-capability-primary' : 'bg-[#162440]')}>
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-60 w-60 rounded-full bg-[#7597ef]/[0.09] blur-[55px]" />
              <div className="relative flex items-start justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-[15px] border border-[#52658c]/40 bg-[#344b77]/40 text-[#b4cdff]"><Icon className="h-[22px] w-[22px]" aria-hidden /></span>
                <span className="font-mono text-[10px] text-[#697c9f]">0{index + 1} / 04</span>
              </div>
              <p className="relative mt-8 text-[11px] font-medium text-[#a4bbec]">{feature.sub}</p>
              <h3 className="relative mt-2 text-[25px] font-semibold tracking-[-0.04em] text-white sm:text-[28px]">{feature.title}</h3>
              <p className="relative mt-3 max-w-[480px] text-[13px] leading-[1.85] text-[#a8b8d3] sm:text-sm">{feature.description}</p>
              <div className="relative mt-auto flex flex-wrap gap-1.5 pt-7">
                {feature.tags.map(tag => <span key={tag} className="rounded-full border border-[#485b7e] bg-[#1d2d4a]/60 px-3 py-1.5 text-[10px] font-medium text-[#bbcee9]">{tag}</span>)}
              </div>
            </article>;
          })}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-[#8194b5]">Some capabilities are plan-dependent; AI availability and limits depend on service readiness. Product preview is illustrative.</p>
      </div>
    </section>
  );
}

export function MarketingConnectedWorkspace() {
  return (
    <section id="teams" className="ap-light-section relative overflow-hidden py-24 sm:py-28 lg:py-36" aria-labelledby="ap-team-heading">
      <div className="mx-auto max-w-[1250px] px-5 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,.85fr)] lg:items-end">
          <div>
            <SectionLabel number="03" light>Built for the way you work</SectionLabel>
            <h2 id="ap-team-heading" className="ap-section-title mt-7 max-w-[720px] text-[#1b2946]">
              Personal enough for one. <span className="text-[#677eab]">Connected enough for a team.</span>
            </h2>
          </div>
          <p className="max-w-[445px] text-[15px] leading-[1.9] text-[#62728a]">
            Start with the work in front of you. When more people join, keep responsibilities, decisions and customer context in one shared place—without changing how you think.
          </p>
        </div>
        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ecosystem.map(({icon: Icon,title,copy}) => (
            <article key={title} className="rounded-[23px] border border-[#dbe3ee] bg-white/80 px-6 py-7 shadow-[0_12px_45px_-38px_rgba(38,56,99,.25)]">
              <Icon className="h-[22px] w-[22px] text-[#5278b7]" aria-hidden />
              <h3 className="mt-6 text-[16px] font-semibold tracking-[-0.02em] text-[#25344e]">{title}</h3>
              <p className="mt-2 text-[13px] leading-[1.8] text-[#6a7890]">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketingIntegrations() {
  return (
    <section id="integrations" className="scroll-mt-24 border-y border-[#31405c] bg-[#111e35] py-20 sm:py-24" aria-labelledby="ap-integrations-heading">
      <div className="mx-auto grid max-w-[1250px] gap-9 px-5 sm:px-8 lg:grid-cols-[minmax(0,.93fr)_minmax(0,1.07fr)] lg:items-center lg:px-10">
        <div>
          <SectionLabel number="04">Connect the edges</SectionLabel>
          <h2 id="ap-integrations-heading" className="ap-section-title mt-6 max-w-[560px] text-white">Your work shouldn't live on an island.</h2>
          <p className="mt-5 max-w-[500px] text-[14px] leading-[1.9] text-[#9fb0cb]">
            Add calendar visibility to your day and connect events to the tools around your team, without losing the work inside Actiproc.
          </p>
          <Link href="#pricing" className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-[#b0c7ff] hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#acc6ff]">
            Compare plan access <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] border border-[#3b4e72] bg-[#1a2c49] p-6">
            <CalendarDays className="h-6 w-6 text-[#b8ceff]" aria-hidden />
            <h3 className="mt-7 text-lg font-semibold text-white">Google Calendar</h3>
            <p className="mt-2 text-[13px] leading-[1.8] text-[#a0b0c9]">Connect personal schedules to the work that matters, with per-user calendar access.</p>
            <span className="mt-7 inline-flex rounded-full border border-[#526a93] px-3 py-1.5 text-[10px] font-medium text-[#b8d0ff]">Pro and Team</span>
          </div>
          <div className="rounded-[22px] border border-[#3b4e72] bg-[#1a2c49] p-6">
            <Webhook className="h-6 w-6 text-[#c4d2ff]" aria-hidden />
            <h3 className="mt-7 text-lg font-semibold text-white">Webhooks</h3>
            <p className="mt-2 text-[13px] leading-[1.8] text-[#a0b0c9]">Connect events to external workflows with signed requests and delivery controls.</p>
            <span className="mt-7 inline-flex rounded-full border border-[#526a93] px-3 py-1.5 text-[10px] font-medium text-[#b8d0ff]">Team plan</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketingFinalCta() {
  return (
    <section className="ap-final-section relative overflow-hidden border-t border-[#293c60] py-24 sm:py-32" aria-labelledby="ap-final-heading">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[340px] w-[650px] max-w-[100vw] -translate-x-1/2 rounded-full bg-[#567fe5]/[0.15] blur-[95px]" />
      <div className="relative mx-auto max-w-[840px] px-5 text-center sm:px-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#3b517a] bg-[#24365a]/55 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-[#b5caff]">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> One connected workspace
        </span>
        <h2 id="ap-final-heading" className="ap-display mt-8 text-[clamp(2.75rem,7vw,5.6rem)] font-semibold leading-[1.04] tracking-[-0.055em] text-white">
          Make space for<br/><span className="ap-headline-accent">better work.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-[600px] text-[15px] leading-[1.85] text-[#a2b3d2] sm:text-[17px]">Give your ideas a place to land. Give your team a clear path forward. Keep what matters connected.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/auth/signup" className={linkStyle + ' bg-[#b9ceff] text-[#0e1e3a] hover:-translate-y-0.5 hover:bg-white focus-visible:ring-[#a6c2ff]'}>
            Create your free workspace <ArrowUpRight className="h-4 w-4" aria-hidden/>
          </Link>
          <Link href="#pricing" className={linkStyle + ' border border-[#425474] bg-white/[0.055] text-[#eef3ff] hover:bg-white/[0.09] focus-visible:ring-[#a6c2ff]'}>
            Compare plans
          </Link>
        </div>
        <p className="mt-5 text-[11px] text-[#8295b5]">Start free. Upgrade as your work grows. No automatic AI overage charges.</p>
      </div>
    </section>
  );
}
