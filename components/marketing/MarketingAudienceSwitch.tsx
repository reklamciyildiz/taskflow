'use client';
import {marketingT,type MarketingLocale} from '@/lib/marketing-locale';

import { useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, LayoutGrid, ListChecks, Sparkles, Users } from 'lucide-react';

type Audience = 'solo' | 'team' | 'organization';

const stories = {
  solo: {
    eyebrow: '01 / PERSONAL WORKSPACE',
    title: 'A clearer day starts here.',
    description: 'Give your tasks, personal projects, calendar and notes a shared home, without having to maintain a dozen separate tools.',
    bullets: ['Plan today and tomorrow', 'Turn ideas into Actions', 'Save the knowledge behind the work'],
    board: 'My focus',
    cards: ['Plan this week', 'Finish the draft', 'Capture new ideas'],
    status: 'One place to focus',
    icon: CalendarDays,
  },
  team: {
    eyebrow: '02 / TEAM WORKSPACE',
    title: 'Everyone sees the next step.',
    description: 'Make ownership, progress and context visible across a team. Work moves without a constant round of status meetings.',
    bullets: ['Processes with shared ownership', 'Roles, checklists and assignments', 'Progress and updates in one view'],
    board: 'Product team',
    cards: ['Review onboarding', 'Confirm release scope', 'Share project updates'],
    status: 'Shared clarity',
    icon: Users,
  },
  organization: {
    eyebrow: '03 / GROWING ORGANIZATIONS',
    title: 'Structure without the silos.',
    description: 'Keep different teams and customer-facing workflows connected while working inside appropriate workspace boundaries.',
    bullets: ['Multiple teams and workflows', 'Organization-scoped access', 'Analytics and Team integrations'],
    board: 'Operations',
    cards: ['Customer rollout', 'Process quality review', 'Coordinate priorities'],
    status: 'Connected operations',
    icon: LayoutGrid,
  },
} as const;

const tabs: { key: Audience; label: string }[] = [
  { key: 'solo', label: 'For myself' },
  { key: 'team', label: 'For my team' },
  { key: 'organization', label: 'For an organization' },
];

export function MarketingAudienceSwitch({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  const [selected, setSelected] = useState<Audience>('solo');
  const story = stories[selected];
  const Icon = story.icon;

  return (
    <div className="ap-audience-switch overflow-hidden rounded-[28px] border border-[#cbd9cd] bg-[#eaf2e9]">
      <div role="tablist" aria-label={t("Explore how Actiproc fits your work")} className="flex flex-wrap gap-1 border-b border-[#cad7ca] p-3 sm:p-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            id={'ap-audience-tab-' + tab.key}
            type="button"
            role="tab"
            aria-controls="ap-audience-panel"
            aria-selected={selected === tab.key}
            onClick={() => setSelected(tab.key)}
            className={'min-h-11 rounded-full px-4 py-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f775b] sm:px-6 sm:text-[13px] ' +
              (selected === tab.key ? 'bg-[#1d3628] text-white shadow-[0_5px_15px_-8px_#173926]' : 'text-[#45634e] hover:bg-white/65')}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <div
        id="ap-audience-panel"
        role="tabpanel"
        aria-labelledby={'ap-audience-tab-' + selected}
        className="grid min-w-0 gap-7 p-5 sm:p-8 lg:grid-cols-[minmax(0,.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-12 lg:p-12"
      >
        <div className="min-w-0">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-[#66856a]">{t(story.eyebrow)}</span>
          <h3 className="mt-5 max-w-[530px] text-[clamp(1.8rem,4vw,3.2rem)] font-semibold leading-[1.12] tracking-[-.055em] text-[#172e22]">{t(story.title)}</h3>
          <p className="mt-5 max-w-[485px] text-[14px] leading-[1.9] text-[#546b59]">{t(story.description)}</p>
          <ul className="mt-7 space-y-3">
            {story.bullets.map(bullet => (
              <li key={t(bullet)} className="flex items-start gap-2.5 text-[13px] font-medium text-[#2f5037]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#55855b]" aria-hidden />{t(bullet)}
              </li>
            ))}
          </ul>
          <a href="#pricing" className="mt-9 inline-flex items-center gap-2 text-[13px] font-semibold text-[#264d31] hover:text-[#62904e] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#527a55]">
            {t("Find your plan")} <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
        <div className="ap-audience-window min-w-0 overflow-hidden rounded-[21px] border border-[#55705d] bg-[#14271f] p-4 shadow-[0_30px_80px_-40px_rgba(13,38,22,.6)] sm:p-5">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-white">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#344c3b] text-[#c4ffa3]"><Icon className="h-4 w-4" aria-hidden /></span>
              {t(story.board)}
            </span>
            <span className="rounded-full border border-[#59735a] px-2.5 py-1 text-[10px] text-[#c6e9c0]">{t(story.status)}</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-white/10 bg-[#1b3327] p-3">
              <p className="flex items-center justify-between text-[10px] font-semibold text-[#bbd1bb]"><span>{t("In progress")}</span><span>{story.cards.length}</span></p>
              <div className="mt-3 space-y-2">
                {story.cards.map((task, index) => (
                  <div key={t(task)} className="rounded-xl border border-[#415847] bg-[#294332] p-3">
                    <p className="text-[11px] font-semibold leading-snug text-white">{t(task)}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#bbd4b7]"><ListChecks className="h-3 w-3" aria-hidden />{index + 1}/4</span>
                      <span className="h-4 w-4 rounded-full bg-[#bce4af]" aria-hidden />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <div className="rounded-2xl border border-white/10 bg-[#21392d] p-4">
                <div className="flex items-center justify-between"><Sparkles className="h-4 w-4 text-[#d4ff9f]" aria-hidden /><span className="text-[10px] text-[#a8c5ae]">{t("Connected knowledge")}</span></div>
                <p className="mt-6 text-[12px] font-semibold text-white">{t("The thinking stays with the work.")}</p>
                <p className="mt-2 text-[10px] leading-relaxed text-[#a9c5ae]">{t("Notes, decisions and next steps in one place.")}</p>
              </div>
              <div className="flex-1 rounded-2xl border border-[#546b4a] bg-[#c8ff93] p-4 text-[#173020]">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.15em]">{t("WORK IN MOTION")}</p>
                <div className="mt-7 flex items-end gap-1.5" aria-hidden>
                  {[40, 62, 49, 78, 66, 90, 100].map((height, index) => (
                    <span key={index} className="flex-1 rounded-t-sm bg-[#244e32]/80" style={{ height: height + 'px', maxHeight: '80px' }} />
                  ))}
                </div>
                <p className="mt-3 text-[10px]">{t("Illustrative experience · not live statistics")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
