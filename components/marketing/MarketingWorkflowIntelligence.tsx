'use client';

import { useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, CalendarClock, Check,
  CheckCircle2, GitBranch, LockKeyhole, RotateCcw, ShieldCheck,
  Sparkles, Users,
} from 'lucide-react';
import { marketingT, type MarketingLocale } from '@/lib/marketing-locale';

type ShowcaseMode = 'dependencies' | 'reporting';
type Period = 7 | 30 | 90;

/** Intentional, static SAMPLE data. No customer records, fake testimonials or live metrics. */
const reportingSamples: Record<Period, {
  created: number;
  completed: number;
  overdue: number;
  buckets: readonly { label: string; created: number; completed: number }[];
}> = {
  7: {
    created: 13, completed: 8, overdue: 3,
    buckets: [
      { label: 'M', created: 2, completed: 1 },
      { label: 'T', created: 1, completed: 2 },
      { label: 'W', created: 3, completed: 1 },
      { label: 'T', created: 2, completed: 1 },
      { label: 'F', created: 3, completed: 2 },
      { label: 'S', created: 1, completed: 0 },
      { label: 'S', created: 1, completed: 1 },
    ],
  },
  30: {
    created: 46, completed: 33, overdue: 3,
    buckets: [
      { label: '01', created: 5, completed: 3 },
      { label: '05', created: 8, completed: 7 },
      { label: '10', created: 6, completed: 5 },
      { label: '15', created: 8, completed: 5 },
      { label: '20', created: 7, completed: 6 },
      { label: '25', created: 7, completed: 4 },
      { label: '30', created: 5, completed: 3 },
    ],
  },
  90: {
    created: 132, completed: 104, overdue: 3,
    buckets: [
      { label: 'W1', created: 14, completed: 10 },
      { label: 'W3', created: 19, completed: 14 },
      { label: 'W5', created: 17, completed: 12 },
      { label: 'W7', created: 21, completed: 17 },
      { label: 'W9', created: 18, completed: 14 },
      { label: 'W11', created: 23, completed: 19 },
      { label: 'W13', created: 20, completed: 18 },
    ],
  },
};

function WorkflowPanel({ locale }: { locale: MarketingLocale }) {
  const t = marketingT(locale);
  const [reviewDone, setReviewDone] = useState(false);
  const stages = [
    {
      id: 'brief', order: '01', phase: 'Review', name: 'Approve launch brief',
      owner: 'Design', state: reviewDone ? 'Complete' : 'In progress', completed: reviewDone,
    },
    {
      id: 'assets', order: '02', phase: 'Production', name: 'Prepare launch assets',
      owner: 'Creative', state: reviewDone ? 'Ready' : 'Blocked', completed: false,
    },
    {
      id: 'launch', order: '03', phase: 'Launch', name: 'Publish the campaign',
      owner: 'Marketing', state: 'Blocked', completed: false,
    },
  ] as const;

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,.32fr)] lg:gap-7" data-marketing-dependency-demo>
      <div className="min-w-0 rounded-[20px] border border-white/[.1] bg-[#111f21] p-4 shadow-[0_24px_65px_-38px_rgba(0,0,0,.75)] sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.19em] text-[#abc2b7]">{t('SAMPLE PROCESS')}</p>
            <h3 className="mt-1 text-sm font-semibold text-white sm:text-base">{t('Product launch')}</h3>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#507553]/70 bg-[#223b2e] px-3 py-1.5 text-[10px] font-semibold text-[#caffaa]">
            <GitBranch className="h-3.5 w-3.5" aria-hidden />{t('Dependent Actions')}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-stretch md:gap-2" role="group" aria-label={t('Sample Action dependency chain')}>
          {stages.map((step, index) => (
            <div key={step.id} className="flex min-w-0 flex-1 items-center gap-2 md:gap-1.5">
              <div className={'flex min-h-[160px] min-w-0 flex-1 flex-col rounded-2xl border p-4 transition-colors duration-300 ' + (
                step.completed
                  ? 'border-[#92c88e]/55 bg-[#233c2c]'
                  : step.id === 'assets' && reviewDone
                    ? 'border-[#a9ef91]/70 bg-[#244031]'
                    : 'border-[#3e5352] bg-[#1b2a2d]'
              )}>
                <div className="flex items-start justify-between gap-1">
                  <span className="font-mono text-[10px] tracking-[.13em] text-[#abc0b9]">{step.order} / {t(step.phase)}</span>
                  {step.completed
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#c9ffae]" aria-hidden />
                    : step.id === 'assets' && reviewDone
                      ? <Check className="h-4 w-4 shrink-0 text-[#c9ffae]" aria-hidden />
                      : step.id === 'brief'
                        ? <Activity className="h-4 w-4 shrink-0 text-[#c0d7d0]" aria-hidden />
                        : <LockKeyhole className="h-4 w-4 shrink-0 text-[#93a8a2]" aria-hidden />}
                </div>
                <h4 className="mt-5 text-[13px] font-semibold leading-snug text-white">{t(step.name)}</h4>
                <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-[#a0b7af]">
                  <Users className="h-3 w-3" aria-hidden />{t(step.owner)}
                </p>
                <div aria-live="polite" className={'mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ' + (
                  step.completed || step.id === 'assets' && reviewDone
                    ? 'bg-[#c8ff93]/15 text-[#d3ffb9]'
                    : step.state === 'Blocked'
                      ? 'bg-[#ddbb79]/10 text-[#f3ce94]'
                      : 'bg-white/10 text-[#deebe6]'
                )}>
                  <span className={'h-1.5 w-1.5 rounded-full ' + (
                    step.completed || step.id === 'assets' && reviewDone ? 'bg-[#c8ff93]' :
                    step.state === 'Blocked' ? 'bg-[#f3ce94]' : 'bg-[#bbd0c9]'
                  )} aria-hidden />
                  {t(step.state)}
                </div>
              </div>
              {index < stages.length - 1 && (
                <ArrowRight className="h-4 w-4 shrink-0 rotate-90 text-[#97ad9e] md:rotate-0" aria-hidden />
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
          <button
            type="button"
            onClick={() => setReviewDone(done => !done)}
            aria-pressed={reviewDone}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c8ff93] px-4 text-[12px] font-semibold text-[#132419] shadow-[0_12px_32px_-20px_#c8ff93] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#111f21]"
          >
            {reviewDone ? <RotateCcw className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            {t(reviewDone ? 'Reopen the review' : 'Complete the review')}
          </button>
          <p className="max-w-[260px] text-[11px] leading-relaxed text-[#a7bfb3]" role="status" aria-live="polite">
            {t(reviewDone
              ? 'The next Action is ready. The launch still waits for asset production.'
              : 'Two Actions are waiting for prerequisite work to finish.')}
          </p>
        </div>
      </div>
      <aside className="flex min-w-0 flex-col justify-between gap-6 rounded-[20px] border border-[#b9dfaf]/25 bg-gradient-to-br from-[#213e31] to-[#162a24] p-5 sm:p-6">
        <div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#92ca80]/25 bg-[#c8ff93]/10 text-[#c9ffad]">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-7 text-[10px] font-semibold uppercase tracking-[.16em] text-[#b9d9bd]">{t('THE RIGHT ORDER')}</p>
          <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-[-.04em] text-white">{t('Keep handoffs visible.')}</h3>
          <p className="mt-3 text-[12px] leading-[1.8] text-[#bbd0c1]">
            {t('Link Actions in the same team. Unfinished prerequisites block completion; finishing one makes the next eligible Action ready.')}
          </p>
        </div>
        <p className="border-t border-[#b6d0bd]/20 pt-4 text-[10px] leading-relaxed text-[#a2bdac]">
          {t('No automatic stage movement or unblock push notifications are promised.')}
        </p>
      </aside>
    </div>
  );
}

function ReportingPanel({ locale }: { locale: MarketingLocale }) {
  const t = marketingT(locale);
  const [period, setPeriod] = useState<Period>(30);
  const sample = reportingSamples[period];
  const max = Math.max(...sample.buckets.flatMap(bucket => [bucket.created, bucket.completed]), 1);

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(230px,.32fr)] lg:gap-7" data-marketing-reporting-demo>
      <div className="min-w-0 rounded-[20px] border border-white/10 bg-[#111f21] p-4 shadow-[0_24px_65px_-38px_rgba(0,0,0,.75)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[.19em] text-[#acc5b9]">{t('SAMPLE REPORT')}</p>
            <h3 className="mt-1 text-sm font-semibold text-white sm:text-base">{t('Operational overview')}</h3>
          </div>
          <div role="group" aria-label={t('Choose a sample reporting period')} className="flex items-center gap-1 rounded-xl border border-white/15 bg-[#223332] p-1">
            {([7, 30, 90] as const).map(days => (
              <button type="button" key={days} onClick={() => setPeriod(days)}
                aria-pressed={period === days}
                className={'min-h-9 rounded-lg px-3 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] ' +
                  (period === days ? 'bg-[#c8ff93] text-[#16271c]' : 'text-[#d5e1dd] hover:bg-white/10')}>
                {days}{t('d')}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2.5" aria-live="polite" aria-atomic="true">
          {([
            { name: 'Created', value: sample.created, icon: Activity, color: 'text-[#c2ceff]' },
            { name: 'Verified completed', value: sample.completed, icon: CheckCircle2, color: 'text-[#c8ff93]' },
            { name: 'Overdue now', value: sample.overdue, icon: CalendarClock, color: 'text-[#f2cf9c]' },
          ] as const).map(metric => {
            const Icon = metric.icon;
            return (
              <div key={metric.name} className="min-w-0 rounded-2xl border border-white/10 bg-[#202f30] p-3 sm:p-4">
                <Icon className={'h-4 w-4 ' + metric.color} aria-hidden />
                <p className="mt-3 text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-none tracking-[-.05em] text-white tabular-nums">{metric.value}</p>
                <p className="mt-2 text-[10px] leading-snug text-[#bbd0c8]">{t(metric.name)}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-5 rounded-2xl border border-white/10 bg-[#172728] p-3 pb-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-semibold text-[#bdcec6]">
            <span>{t('Created vs. verified completed')}</span>
            <span className="inline-flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#999ff2]" />{t('Created')}</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#b9ff91]" />{t('Completed')}</span>
            </span>
          </div>
          <div className="mt-5 flex h-32 w-full min-w-0 items-end gap-2 sm:h-40 sm:gap-4" role="img"
            aria-label={t('Illustrative activity chart for the selected period')}>
            {sample.buckets.map((bucket, index) => (
              <div key={index} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                <div className="flex h-[calc(100%-21px)] w-full items-end justify-center gap-1 sm:gap-1.5">
                  <div className="w-[30%] min-w-[4px] max-w-7 rounded-t-[4px] bg-[#999ff2] transition-[height] duration-300" style={{height: (bucket.created / max * 100) + '%'}} />
                  <div className="w-[30%] min-w-[4px] max-w-7 rounded-t-[4px] bg-[#b9ff91] transition-[height] duration-300" style={{height: (bucket.completed / max * 100) + '%'}} />
                </div>
                <span className="mt-2 text-[9px] text-[#9cafaa]">{bucket.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <aside className="flex min-w-0 flex-col justify-between gap-6 rounded-[20px] border border-[#a8a9e9]/25 bg-gradient-to-br from-[#242c48] to-[#17252f] p-5 sm:p-6">
        <div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#b8c4ff]/20 bg-[#9da7f6]/10 text-[#b8c9ff]">
            <BarChart3 className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-7 text-[10px] font-semibold uppercase tracking-[.16em] text-[#bfcbe4]">{t('THE CLEARER PICTURE')}</p>
          <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-[-.04em] text-white">{t('See what is moving.')}</h3>
          <p className="mt-3 text-[12px] leading-[1.8] text-[#bdcad9]">
            {t('Filter by Process, assignee and activity period. Review overdue Actions and export a scoped CSV from the real Analytics screen.')}
          </p>
        </div>
        <p className="border-t border-white/15 pt-4 text-[10px] leading-relaxed text-[#b1bdd1]">
          {t('Historical completions use verified completion dates. This sample is not live analytics.')}
        </p>
      </aside>
    </div>
  );
}

/** Marketing-only, privacy-safe illustrations; never call authenticated workspace APIs. */
export function MarketingWorkflowIntelligence({ locale = 'en' }: { locale?: MarketingLocale }) {
  const t = marketingT(locale);
  const [mode, setMode] = useState<ShowcaseMode>('dependencies');
  const tabs: readonly ShowcaseMode[] = ['dependencies', 'reporting'];

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, current: ShowcaseMode) => {
    const next = event.key === 'Home' ? tabs[0]
      : event.key === 'End' ? tabs[1]
        : event.key === 'ArrowRight' ? tabs[(tabs.indexOf(current) + 1) % tabs.length]
          : event.key === 'ArrowLeft' ? tabs[(tabs.indexOf(current) + tabs.length - 1) % tabs.length]
            : null;
    if (!next) return;
    event.preventDefault();
    setMode(next);
    const nextButton = document.getElementById('marketing-intelligence-tab-' + next);
    nextButton?.focus();
  };

  return (
    <section id="smart-workflows" className="relative isolate scroll-mt-24 overflow-hidden border-y border-[#355444]/55 bg-[#091713] py-20 text-white sm:py-28"
      aria-labelledby="marketing-intelligence-heading">
      <div aria-hidden className="pointer-events-none absolute left-[-15%] top-0 h-72 w-96 rounded-full bg-[#57935b]/10 blur-[100px]" />
      <div aria-hidden className="pointer-events-none absolute bottom-0 right-[-12%] h-72 w-96 rounded-full bg-[#7892ce]/10 blur-[100px]" />
      <div className="relative mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-14">
          <div className="max-w-[780px]">
            <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.21em] text-[#c8ff93]">
              <Sparkles className="h-4 w-4" aria-hidden />{t('CONNECTED WORK / IN PRACTICE')}
            </p>
            <h2 id="marketing-intelligence-heading" className="mt-5 max-w-[850px] text-[clamp(2rem,4.7vw,4.4rem)] font-semibold leading-[1.08] tracking-[-.065em] text-white">
              {t('Know what comes next.')}<br />
              <span className="text-[#c8ff93]">{t('See what got done.')}</span>
            </h2>
          </div>
          <p className="max-w-[365px] text-[13px] leading-[1.9] text-[#b9ccc1] sm:text-[14px]">
            {t('Smart Dependencies connect the handoffs. Advanced Reporting makes workload, overdue work and verified delivery easier to understand.')}
          </p>
        </div>
        <div className="mt-10 flex min-w-0 flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-4 sm:mt-12">
          <div role="tablist" aria-label={t('Explore connected work features')} className="inline-flex max-w-full flex-wrap gap-1.5 rounded-2xl border border-white/15 bg-white/[.055] p-1.5">
            {tabs.map(tab => {
              const selected = tab === mode;
              const Icon = tab === 'dependencies' ? GitBranch : BarChart3;
              return (
                <button type="button" key={tab} id={'marketing-intelligence-tab-' + tab}
                  role="tab" aria-controls="marketing-intelligence-panel" aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onKeyDown={event => moveFocus(event, tab)} onClick={() => setMode(tab)}
                  className={'inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] sm:px-5 sm:text-[13px] ' + (
                    selected ? 'bg-[#c8ff93] text-[#112119]' : 'text-[#d1e0d7] hover:bg-white/10'
                  )}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {t(tab === 'dependencies' ? 'Smart Dependencies' : 'Advanced Reporting')}
                </button>
              );
            })}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#577362] px-3 py-2 text-[10px] font-medium text-[#bfcfc4]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff93]" aria-hidden />
            {t('Interactive illustration · no account required')}
          </span>
        </div>
        <div className="mt-6" role="tabpanel" id="marketing-intelligence-panel"
          aria-labelledby={'marketing-intelligence-tab-' + mode} tabIndex={0}>
          {mode === 'dependencies' ? <WorkflowPanel locale={locale} /> : <ReportingPanel locale={locale} />}
        </div>
        <div className="mt-7 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-[11px] leading-relaxed text-[#a8bdb0]">
            {t('This walkthrough uses invented sample Actions and metrics. Actual features depend on workspace access and plan.')}
          </p>
          <Link href="/auth/signup"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#6d936b] bg-[#29432c] px-5 text-[12px] font-semibold text-[#d8ffc2] transition-colors hover:border-[#c8ff93] hover:bg-[#37583a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
            {t('Explore Actiproc for free')} <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
