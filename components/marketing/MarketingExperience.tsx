import {marketingT,type MarketingLocale} from '@/lib/marketing-locale';
import Link from 'next/link';
import {
  ArrowDown, ArrowRight, ArrowUpRight, BarChart3, BellRing, BookOpenText,
  CalendarDays, CheckCircle2, Cloud, Fingerprint, Layers3, ListChecks,
  Network, NotebookPen, PanelLeft, Search, Sparkles, Users, Webhook,
  Workflow, Smartphone, CalendarClock, ShieldCheck, Check, Zap,
} from 'lucide-react';
import { MarketingWorkspacePreview } from './MarketingWorkspacePreview';
import { MarketingAudienceSwitch } from './MarketingAudienceSwitch';

const button = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[13px] font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[.98] sm:text-sm';

const process = [
  { no: '01', label: 'CAPTURE', icon: NotebookPen, title: 'A place for every idea.', detail: 'Collect an incoming request, thought or task before it gets lost in another tab.' },
  { no: '02', label: 'ORGANIZE', icon: Layers3, title: 'Give the work structure.', detail: 'Turn it into an Action, choose a Process, and make the owner and next step clear.' },
  { no: '03', label: 'MOVE', icon: ListChecks, title: 'Make the next move.', detail: 'Move across stages, check off the details, and bring deadlines into your Planner.' },
  { no: '04', label: 'REMEMBER', icon: BookOpenText, title: 'Keep what matters.', detail: 'Preserve notes, decisions and learnings in your searchable Knowledge Hub.' },
] as const;

const features = [
  {
    no: '01', icon: PanelLeft, title: 'Processes & boards',
    eyebrow: 'THE BIG PICTURE', className: 'ap-feature-hero',
    description: 'Build the exact stages your work needs. See every Action move from idea to done, or switch to a focused list.',
    tags: ['Custom workflow stages', 'Kanban & list views', 'Priorities'],
  },
  {
    no: '02', icon: Sparkles, title: 'Actiproc AI',
    eyebrow: 'CONTEXT, NOT JUST CHAT', className: 'ap-feature-ai',
    description: 'Ask about your work, discover relevant context and prepare changes with review controls when available.',
    tags: ['Workspace context', 'Relevant references', 'Plan-based allowances'],
  },
  {
    no: '03', icon: CalendarDays, title: 'Planner & calendar',
    eyebrow: 'TIME, CONNECTED', className: '',
    description: 'Bring your scheduled work, deadlines, reminders and calendar visibility into one thoughtful daily view.',
    tags: ['Planning', 'Reminders', 'Calendar access'],
  },
  {
    no: '04', icon: NotebookPen, title: 'Rich notes',
    eyebrow: 'THINK IN CONTEXT', className: '',
    description: 'Write and organize detailed notes without detaching the thinking from the Action or Process behind it.',
    tags: ['Rich text', 'Action notes', 'Search'],
  },
  {
    no: '05', icon: BookOpenText, title: 'Knowledge Hub',
    eyebrow: 'A MEMORY FOR THE WORK', className: '',
    description: 'Find decisions, useful notes and reusable learnings long after the original task is finished.',
    tags: ['Knowledge search', 'Linked context', 'Find it again'],
  },
  {
    no: '06', icon: ListChecks, title: 'Actions & checklists',
    eyebrow: 'EXECUTION, IN DETAIL', className: '',
    description: 'Keep ownership, priorities, checklist steps and next actions together instead of scattering them.',
    tags: ['Assignments', 'Subtasks', 'Due dates'],
  },
  {
    no: '07', icon: Users, title: 'Team workspaces',
    eyebrow: 'BUILT TO WORK TOGETHER', className: '',
    description: 'Share the same operating space with teammates while keeping roles and responsibilities clear.',
    tags: ['Teams & roles', 'Shared processes', 'Permissions'],
  },
  {
    no: '08', icon: BellRing, title: 'Inbox & notifications',
    eyebrow: 'NOTHING FALLS THROUGH', className: '',
    description: 'Keep incoming work, updates and reminders close enough to act on without getting lost in the noise.',
    tags: ['Notifications', 'Quick access', 'Action context'],
  },
  {
    no: '09', icon: BarChart3, title: 'Analytics & achievements',
    eyebrow: 'SEE THE PROGRESS', className: '',
    description: 'Get perspective on work completed, activity and the milestones behind meaningful momentum.',
    tags: ['Activity', 'Progress', 'Achievements'],
  },
  {
    no: '10', icon: Network, title: 'Customer workflows',
    eyebrow: 'WORK MEETS RELATIONSHIPS', className: '',
    description: 'Keep customer-related context near the people, decisions and Actions responsible for delivering it.',
    tags: ['Customers', 'Related work', 'Shared context'],
  },
  {
    no: '11', icon: Fingerprint, title: 'Workspace permissions',
    eyebrow: 'CONTROL BY DESIGN', className: '',
    description: 'Maintain organization boundaries and role-based access as your workspace grows beyond just you.',
    tags: ['Access controls', 'Organization scope', 'Roles'],
  },
  {
    no: '12', icon: Smartphone, title: 'Web & mobile access',
    eyebrow: 'WORK FROM ANYWHERE', className: '',
    description: 'Stay connected from desktop or smaller screens, including supported installable web experiences.',
    tags: ['Responsive web', 'PWA', 'On the go'],
  },
] as const;

function Kicker({ number, children, inverse = false }: { number: string; children: React.ReactNode; inverse?: boolean }) {
  return (
    <p className={'ap-kicker inline-flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.22em] sm:text-[11px] ' + (inverse ? 'text-[#56637b]' : 'text-[#b8ff91]')}>
      <span className={'inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 font-mono text-[10px] ' + (inverse ? 'border-[#b8c1d0] text-[#45536b]' : 'border-[#5b714e] text-[#ccffb6]')}>{number}</span>
      {children}
    </p>
  );
}

export function MarketingHero({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  return (
    <section className="ap-hero relative isolate overflow-hidden pt-14 sm:pt-20 lg:pt-24" aria-labelledby="marketing-hero-title">
      <div aria-hidden className="ap-hero-grid pointer-events-none absolute inset-0" />
      <div aria-hidden className="ap-orb ap-orb-one pointer-events-none absolute" />
      <div aria-hidden className="ap-orb ap-orb-two pointer-events-none absolute" />
      <div className="relative z-10 mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
        <div className="ap-enter flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.19em] text-[#bdeea9]">
            <span className="h-2 w-2 rounded-full bg-[#c9ff92] shadow-[0_0_18px_#a6ff65]" />
            WORK, WITHOUT THE FRAGMENTS
          </span>
          <Link href="#community" className="group inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[.04em] text-[#bff5af] transition-colors hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]"><span className="rounded-full border border-[#577f58] bg-[#234530] px-2 py-1 text-[9px] font-bold text-[#d8ffb8]">{t("NEW")}</span> {t("Suggest features & follow updates")} <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /></Link>
        </div>
        <div className="grid gap-8 pb-12 pt-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(285px,.55fr)] lg:items-end lg:gap-16 lg:pb-16 lg:pt-14">
          <div className="min-w-0">
            <h1 id="marketing-hero-title" className="ap-enter ap-display ap-hero-title max-w-[950px] font-semibold uppercase text-white" style={{ animationDelay: '80ms' }}>
              {t('Everything')}<br />
              <span className="ap-headline-accent">{t("moves")}</span><br />
              {t('together')}<span className="ap-hero-period">.</span>
            </h1>
          </div>
          <div className="ap-enter max-w-[445px] pb-2 lg:pb-5" style={{ animationDelay: '160ms' }}>
            <p className="text-[17px] font-medium leading-[1.65] text-[#edf2f1] sm:text-[19px]">{t("Your ideas, Actions, Processes, time, knowledge and people. Finally in sync.")}</p>
            <p className="mt-4 text-[13px] leading-[1.85] text-[#9caeaf] sm:text-[14px]">{t("Actiproc connects the entire journey from the first thought to the finished work. Less switching. More clarity.")}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/auth/signup" className={button + ' bg-[#c8ff93] text-[#0b1710] hover:-translate-y-0.5 hover:bg-white focus-visible:ring-[#c8ff93] focus-visible:ring-offset-[#091315]'}>
                {t("Start for free")} <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="#experience" className={button + ' border border-white/20 bg-white/[.055] text-white hover:border-white/50 hover:bg-white/[.1] focus-visible:ring-white focus-visible:ring-offset-[#091315]'}>
                {t("Explore the product")} <ArrowDown className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-[#9dacb2]">
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#c8ff93]" aria-hidden /> {t("Free plan available")}</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#c8ff93]" aria-hidden /> {t("Individuals to teams")}</span>
            </div>
          </div>
        </div>
        <div id="experience" className="ap-enter relative scroll-mt-24 pb-12 sm:pb-20" style={{ animationDelay: '240ms' }}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[.23em] text-[#b8ff91]">{t("THE ACTIPROC EXPERIENCE / 001")}</p>
              <h2 className="mt-2 text-[21px] font-semibold tracking-[-.04em] text-[#f1f7f2] sm:text-2xl">{t("See how everything connects.")}</h2>
            </div>
            <p className="max-w-[300px] text-[11px] leading-relaxed text-[#8d9fa7]">{t("Tap the product tabs to explore the illustrative workspace. No account needed.")}</p>
          </div>
          <div className="ap-demo-stage relative">
            <MarketingWorkspacePreview locale={locale} />
            <div aria-hidden className="ap-floating-note ap-floating-one hidden lg:flex"><span className="h-2 w-2 rounded-full bg-[#c8ff93]" /> {t("FROM IDEA → DONE")}</div>
            <div aria-hidden className="ap-floating-note ap-floating-two hidden lg:flex"><Sparkles className="h-3.5 w-3.5" /> {t("CONNECTED CONTEXT")}</div>
          </div>
        </div>
      </div>
      <div className="ap-marquee relative overflow-hidden border-y border-white/10 py-4" aria-label={t("A connected system for work")}>
        <div className="ap-marquee-track flex w-max items-center gap-10 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[.24em] text-[#b8c5c1]">
          {Array.from({ length: 3 }, (_, index) => (
            <span key={index} aria-hidden={index > 0} className="inline-flex items-center gap-10">
              <span>{t("Processes")}</span><span className="ap-marquee-star">✳</span><span>{t("Actions")}</span><span className="ap-marquee-star">✳</span>
              <span>{t("Planner")}</span><span className="ap-marquee-star">✳</span><span>{t("Knowledge")}</span><span className="ap-marquee-star">✳</span>
              <span>{t("Actiproc AI")}</span><span className="ap-marquee-star">✳</span><span>{t("Teams")}</span><span className="ap-marquee-star">✳</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketingWorkflow({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  return (
    <section id="workflow" className="ap-light-section scroll-mt-24 py-24 sm:py-32" aria-labelledby="ap-workflow-heading">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
        <Kicker number="01" inverse>{t("THE CONNECTED LOOP")}</Kicker>
        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)] lg:items-end lg:gap-16">
          <h2 id="ap-workflow-heading" className="ap-section-title max-w-[850px] text-[#111b25]">{t("An idea should never become")} <em className="ap-serif-accent text-[#6c7d6c]">{t("another loose end.")}</em></h2>
          <p className="max-w-[470px] pb-2 text-[15px] leading-[1.85] text-[#56616d]">{t("Most tools handle one moment. Actiproc connects the whole loop, so the next step always has the context of the one before it.")}</p>
        </div>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
          {process.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.no} className="ap-flow-card relative min-w-0 overflow-hidden rounded-[23px] border border-[#d9dfdc] bg-white p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="ap-flow-number font-mono text-[37px] font-semibold leading-none tracking-[-.08em]">{step.no}</span>
                  <Icon className="h-5 w-5 text-[#46604e]" aria-hidden />
                </div>
                <p className="mt-12 text-[10px] font-bold tracking-[.2em] text-[#6e8071]">{t(step.label)}</p>
                <h3 className="mt-3 text-[20px] font-semibold leading-snug tracking-[-.035em] text-[#1a262b]">{t(step.title)}</h3>
                <p className="mt-3 text-[13px] leading-[1.85] text-[#64716d]">{t(step.detail)}</p>
                {index < process.length - 1 && <ArrowRight className="ap-flow-arrow absolute right-4 top-[65px] hidden h-4 w-4 text-[#7da088] lg:block" aria-hidden />}
              </article>
            );
          })}
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[#d6ded7] pt-6">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-[#657267]"><Workflow className="h-4 w-4" aria-hidden /> {t("One continuous workflow, not four disconnected apps.")}</span>
          <Link href="#product" className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#263e30] hover:text-[#527f46] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#527f46]">
            {t("See every capability")} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function MarketingProductSystem({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  return (
    <section id="product" className="ap-product-section relative isolate scroll-mt-24 overflow-hidden py-24 sm:py-32" aria-labelledby="ap-product-heading">
      <div aria-hidden className="ap-product-halo pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
        <Kicker number="02">{t("ONE PLATFORM. THE WHOLE PICTURE.")}</Kicker>
        <div className="mt-7 grid gap-7 md:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)] md:items-end md:gap-16">
          <h2 id="ap-product-heading" className="ap-section-title max-w-[810px] text-white">{t("Not another task list.")} <em className="ap-serif-accent text-[#b9ff91]">{t("Your work system.")}</em></h2>
          <p className="max-w-[430px] pb-1 text-[14px] leading-[1.9] text-[#b5c3bf] sm:text-[15px]">{t("Everything has its own purpose. The value comes from how they work together. Explore the actual product areas below.")}</p>
        </div>
        <div id="features" className="mt-12 grid scroll-mt-24 gap-3 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article key={t(feature.title)} className={'ap-feature-card group relative flex min-h-[260px] min-w-0 flex-col overflow-hidden rounded-[25px] border p-6 sm:p-7 ' + feature.className}>
                <div aria-hidden className="ap-feature-sheen pointer-events-none absolute inset-0" />
                <div className="relative flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/15 bg-white/[.08] text-[#d1ffc1]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="font-mono text-[11px] text-[#97a8a7]">{feature.no} / 12</span>
                </div>
                <p className="relative mt-7 text-[10px] font-semibold tracking-[.18em] text-[#abff93]">{t(feature.eyebrow)}</p>
                <h3 className="relative mt-2 text-[22px] font-semibold tracking-[-.045em] text-white sm:text-[24px]">{feature.title}</h3>
                <p className="relative mt-3 max-w-[480px] text-[13px] leading-[1.8] text-[#b7c3c7]">{t(feature.description)}</p>
                <div className="relative mt-auto flex flex-wrap gap-1.5 pt-7">
                  {feature.tags.map(tag => <span key={tag} className="rounded-full border border-white/[.12] bg-white/[.04] px-2.5 py-1 text-[10px] font-medium text-[#d0dcda]">{t(tag)}</span>)}
                </div>
                {index === 0 && <span aria-hidden className="ap-feature-orbit absolute -right-12 -top-12 h-52 w-52 rounded-full border border-white/10" />}
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-[11px] leading-[1.8] text-[#8ea09b]">{t("Some features, integrations and AI usage allowances depend on plan, access and service readiness. Illustrations are demonstrations, not live customer activity.")}</p>
      </div>
    </section>
  );
}

export function MarketingConnectedWorkspace({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  return (
    <section id="teams" className="ap-audience-section scroll-mt-24 py-24 sm:py-32" aria-labelledby="ap-teams-heading">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,.65fr)] lg:items-end">
          <div>
            <Kicker number="03" inverse>{t("ONE WORKSPACE. YOUR WAY.")}</Kicker>
            <h2 id="ap-teams-heading" className="ap-section-title mt-7 max-w-[820px] text-[#132127]">{t("From one brilliant mind to")} <em className="ap-serif-accent text-[#617b69]">{t("a whole team.")}</em></h2>
          </div>
          <p className="max-w-[440px] pb-1 text-[14px] leading-[1.9] text-[#586b66] sm:text-[15px]">{t("The structure grows with your work, whether you're organizing yourself, coordinating a small team or operating across groups.")}</p>
        </div>
        <div className="mt-12"><MarketingAudienceSwitch locale={locale} /></div>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Users, title: 'Ownership', description: 'Assign responsibility and keep the next step visible.' },
            { icon: ShieldCheck, title: 'Control', description: 'Roles and organization-scoped boundaries as you grow.' },
            { icon: BarChart3, title: 'Visibility', description: 'Make progress, updates and activity easier to understand.' },
          ].map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-[#d7dfd6] bg-white/70 p-5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#44704e]" aria-hidden />
              <div><p className="font-semibold text-[#1d3027]">{t(title)}</p><p className="mt-1 text-[12px] leading-[1.7] text-[#63716b]">{t(description)}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketingIntegrations({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  return (
    <section id="integrations" className="ap-integrations-section scroll-mt-24 border-y border-white/10 py-24 sm:py-28" aria-labelledby="ap-integrations-heading">
      <div className="mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:items-center">
          <div>
            <Kicker number="04">{t("CONNECTED BY DESIGN")}</Kicker>
            <h2 id="ap-integrations-heading" className="ap-section-title mt-7 max-w-[570px] text-white">{t("Built to connect")} <em className="ap-serif-accent text-[#b9ff91]">{t("beyond the app.")}</em></h2>
            <p className="mt-6 max-w-[490px] text-[14px] leading-[1.95] text-[#aabfb4]">{t("Use integrations where they make sense, without breaking the connection between your planning, execution and knowledge.")}</p>
            <Link href="#pricing" className="mt-8 inline-flex items-center gap-2 text-[13px] font-semibold text-[#c9ff9e] hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9ff91]">
              {t("Compare plan access")} <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="ap-connection-board relative grid gap-3 rounded-[28px] border border-[#354941] bg-[#11241e] p-4 sm:grid-cols-2 sm:p-6">
            <div className="ap-connection-core flex min-h-[190px] flex-col justify-between rounded-[20px] border border-[#56765b] bg-[#233d30] p-6 sm:col-span-2 sm:min-h-[150px]">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-white"><Zap className="h-4 w-4 text-[#d5ff9e]" aria-hidden /> {t("Actiproc workspace")}</span>
                <span className="rounded-full bg-[#c8ff93] px-2.5 py-1 text-[10px] font-bold text-[#173326]">{t("CONNECTED")}</span>
              </div>
              <p className="mt-6 max-w-[430px] text-[13px] leading-relaxed text-[#b9d2bb]">{t("One source of work context, connected to the tools and people around it.")}</p>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/[.055] p-5">
              <CalendarClock className="h-6 w-6 text-[#c8ff93]" aria-hidden />
              <h3 className="mt-5 text-[18px] font-semibold text-white">{t("Google Calendar")}</h3>
              <p className="mt-2 text-[12px] leading-[1.8] text-[#a5b9ae]">{t("Bring personal schedules into view alongside your work.")}</p>
              <span className="mt-5 inline-flex rounded-full border border-white/15 px-3 py-1.5 text-[10px] text-[#c7d8cd]">{t("Pro & Team")}</span>
            </div>
            <div className="rounded-[20px] border border-white/10 bg-white/[.055] p-5">
              <Webhook className="h-6 w-6 text-[#c8ff93]" aria-hidden />
              <h3 className="mt-5 text-[18px] font-semibold text-white">{t("Team webhooks")}</h3>
              <p className="mt-2 text-[12px] leading-[1.8] text-[#a5b9ae]">{t("Connect signed events to external automations and services.")}</p>
              <span className="mt-5 inline-flex rounded-full border border-white/15 px-3 py-1.5 text-[10px] text-[#c7d8cd]">{t("Team plan")}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketingFAQ({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  const items = [
    { question: 'Do I need to pay to start?', answer: 'No. The Free plan is available with one Process and one workspace. Paid plans add capacity and plan-specific capabilities.' },
    { question: 'Is this interactive preview a real workspace?', answer: 'It is an illustrative, in-browser walkthrough. It does not access customer information, create an account or save changes to your Actiproc workspace.' },
    { question: 'Can I use Actiproc on my phone?', answer: 'Actiproc offers a responsive web experience, including supported installable web options. Platform-specific native app availability may vary.' },
    { question: 'How does Actiproc AI work?', answer: 'AI can help with accessible workspace context and assist with work, subject to access, plan limits and service availability. The pricing cards show the current published allowances.' },
    { question: 'Do teams need a different product?', answer: 'No. Shared workspaces, assignments, access controls and team-specific integrations build on the same connected Actiproc workflow.' },
    { question: 'Can I suggest a feature or improvement?', answer: 'Yes. Signed-in users on any plan can submit ideas, support suggestions and follow review or release updates in the Fikirler & Öneriler feedback hub. Submissions are moderated, and votes do not guarantee implementation.' },
    { question: 'Where can I check the final subscription price?', answer: 'Plans are listed in USD. Any applicable taxes, seat counts and the final amount are presented during the secure checkout process.' },
  ] as const;
  return (
    <section id="faq" className="ap-faq-section border-t border-[#dce4df] py-24 sm:py-28" aria-labelledby="ap-faq-heading">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,.7fr)_minmax(0,1fr)] lg:gap-20 lg:px-10">
        <div>
          <Kicker number="07" inverse>{t("THE DETAILS MATTER")}</Kicker>
          <h2 id="ap-faq-heading" className="ap-section-title mt-7 max-w-[500px] text-[#16231f]">{t("Good questions.")} <em className="ap-serif-accent text-[#718475]">{t("Clear answers.")}</em></h2>
          <p className="mt-5 max-w-[350px] text-[14px] leading-[1.85] text-[#64716c]">{t("A quick look at what to expect before you build your workspace.")}</p>
        </div>
        <div className="divide-y divide-[#d2ded6] border-t border-[#d2ded6]">
          {items.map(item => (
            <details key={item.question} className="ap-faq-item group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[15px] font-semibold tracking-[-.025em] text-[#1d2d25] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5d896c] sm:text-[17px]">
                <span>{t(item.question)}</span>
                <span className="ap-faq-toggle flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#bdcfc1] text-[#45634c]">+</span>
              </summary>
              <p className="max-w-[590px] pb-2 pr-10 pt-4 text-[13px] leading-[1.9] text-[#67766c] sm:text-[14px]">{t(item.answer)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketingFinalCta({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  return (
    <section className="ap-final-section relative isolate overflow-hidden py-24 sm:py-32 lg:py-40" aria-labelledby="ap-final-heading">
      <div aria-hidden className="ap-final-halo pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1320px] px-5 sm:px-8 lg:px-10">
        <Kicker number="08">{t("MAKE THE NEXT MOVE")}</Kicker>
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,.6fr)] lg:items-end">
          <h2 id="ap-final-heading" className="ap-final-title max-w-[950px] font-semibold uppercase text-white">{t("Less managing.")}<br /><span className="text-[#c8ff93]">{t("More making.")}</span></h2>
          <div className="max-w-[410px] pb-3">
            <p className="text-[16px] leading-[1.8] text-[#c4d1ca]">{t("Your best work deserves a system where everything belongs.")}</p>
            <Link href="/auth/signup" className={button + ' mt-7 bg-[#c8ff93] text-[#0e2015] hover:-translate-y-0.5 hover:bg-white focus-visible:ring-[#c8ff93] focus-visible:ring-offset-[#0b1713]'}>
              {t("Create your free workspace")} <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
            <p className="mt-4 text-[11px] text-[#93ab9b]"><Check className="mr-1 inline h-3.5 w-3.5 text-[#c8ff93]" aria-hidden /> {t("Start on the Free plan")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
