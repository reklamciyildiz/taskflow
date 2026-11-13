import {marketingT,type MarketingLocale} from '@/lib/marketing-locale';
import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, Check, ChevronUp,
  Lightbulb, MessageCircle, MessageSquareText, Sparkles,
} from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: Lightbulb,
    title: 'Suggest an improvement',
    detail: 'Tell us what is missing or what takes too many steps.',
  },
  {
    number: '02',
    icon: ChevronUp,
    title: 'Support useful ideas',
    detail: 'Back requests that would make your work easier.',
  },
  {
    number: '03',
    icon: MessageSquareText,
    title: 'Follow progress',
    detail: 'See updates as ideas are reviewed, planned or shipped.',
  },
] as const;

/**
 * Marketing-only, static illustration of the actual Feedback Hub.
 * No fake live votes, customer testimonials or runtime feedback API calls.
 */
function CommunityPreview({locale}:{locale:MarketingLocale}) {
  const t=marketingT(locale);
  return (
    <div className="relative min-w-0" role="img" aria-label={t("Illustrative Actiproc community feedback interface showing an idea and its review status")}>
      <div aria-hidden="true" className="pointer-events-none absolute -inset-5 rounded-[40px] bg-[radial-gradient(ellipse_at_60%_40%,rgba(165,255,143,.14),transparent_60%)] blur-2xl" />
      <div className="relative overflow-hidden rounded-[26px] border border-[#446457] bg-[#0d1817] p-2.5 shadow-[0_40px_120px_-55px_rgba(0,0,0,.95)] sm:p-3">
        <div className="overflow-hidden rounded-[19px] border border-[#315044] bg-[#111d1d]">
          <div className="flex items-center justify-between gap-3 border-b border-[#2b403a] bg-[#162520] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#d08c7d]" />
              <span className="h-2 w-2 rounded-full bg-[#e1bd73]" />
              <span className="h-2 w-2 rounded-full bg-[#83c8a0]" />
            </div>
            <span className="max-w-[55%] truncate font-mono text-[10px] text-[#90aea2]">{t("Actiproc / Community feedback")}</span>
            <span className="h-4 w-4 rounded border border-[#587267] bg-[#233e32]" />
          </div>
          <div className="relative overflow-hidden bg-[radial-gradient(ellipse_at_80%_2%,rgba(72,148,109,.19),transparent_48%),linear-gradient(130deg,#12231e,#0d1d1b)] px-5 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#517567] bg-[#294236] px-2.5 py-1 text-[10px] font-semibold text-[#caffaa]">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {t("COMMUNITY & PRODUCT DEVELOPMENT")}
            </span>
            <h3 className="mt-4 max-w-[450px] text-[24px] font-semibold leading-[1.15] tracking-[-.055em] text-white sm:text-[30px]">
              Your ideas help shape what&apos;s next.
            </h3>
            <p className="mt-3 max-w-[400px] text-[12px] leading-[1.8] text-[#bdccc3]">
              {t("Suggest a feature, find similar requests and follow updates in one place.")}
            </p>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#c8ff93] px-3.5 py-2 text-[11px] font-semibold text-[#153121]">
              <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" /> Share an idea
            </span>
          </div>
          <div className="space-y-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[#385149] bg-[#1b2b29] px-3 py-2.5 text-[11px]">
              <span className="rounded-lg bg-[#c8ff93] px-2.5 py-1.5 font-semibold text-[#193420]">{t("All ideas")}</span>
              <span className="px-2 py-1 text-[#b5c6bd]">{t("My ideas")}</span>
              <span className="px-2 py-1 text-[#b5c6bd]">{t("Updates")}</span>
            </div>
            <div className="flex gap-3 rounded-[14px] border border-[#395149] bg-[#1b2828] p-3.5 sm:gap-4 sm:p-4">
              <div className="flex h-[60px] w-[49px] shrink-0 flex-col items-center justify-center gap-1 rounded-[12px] border border-[#276f5c] bg-[#183c31] text-[#90edac]">
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
                <span className="font-mono text-[11px]">♥</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-[#a9c4b5]">{t("FEATURE REQUEST / WORKFLOWS")}</p>
                <h4 className="mt-1.5 text-[14px] font-semibold leading-snug tracking-tight text-white sm:text-[16px]">
                  {t("Recurring Action automations")}
                </h4>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#a8bcb4]">{t("Spend less time on repeat tasks and manual status updates.")}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#526356] bg-[#263630] px-2.5 py-1 text-[10px] text-[#d3e5d3]">{t("Suggested")}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-[#91a79c]"><MessageCircle className="h-3 w-3" aria-hidden="true" /> {t("Discuss ideas")}</span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-[12px] border border-[#325b48] bg-[#193727] p-3.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2d6340] text-[#c8ff93]"><Check className="h-4 w-4" aria-hidden="true" /></span>
              <div className="text-[11px] leading-relaxed text-[#d6e7d8]">
                <strong className="block text-[#e5f8e1]">{t("A clearer product roadmap")}</strong>
                {t("Track decisions and releases without losing your original request.")}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-[#82998a]">
        {t("Illustrative product preview · Not live vote counts or customer activity")}
      </p>
    </div>
  );
}

export function MarketingFeedbackCommunity({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  return (
    <section id="community" aria-labelledby="marketing-community-title"
      className="relative isolate scroll-mt-24 overflow-hidden border-t border-white/10 bg-[#0a1915] py-24 sm:py-28 lg:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_100%,rgba(72,140,87,.1),transparent_52%)]" />
      <div className="relative mx-auto grid max-w-[1320px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)] lg:gap-14 lg:px-10">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.2em] text-[#b8ff91] sm:text-[11px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#54714b] font-mono text-[10px]">05</span>
            {t("BUILT WITH YOU")}
          </p>
          <h2 id="marketing-community-title" className="ap-section-title mt-7 max-w-[650px] text-white">
            {t("Better work starts with")} <em className="ap-serif-accent text-[#b9ff91]">{t("better feedback.")}</em>
          </h2>
          <p className="mt-6 max-w-[540px] text-[14px] leading-[1.95] text-[#adc4b7] sm:text-[15px]">
            Actiproc now has a dedicated place for feature requests and improvements.
            Tell us what slows you down, support ideas you care about, and follow the decisions that shape the product.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/feedback"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c8ff93] px-6 text-[13px] font-semibold text-[#0e2819] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1915]">
              {t("Share your idea")} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/auth/signup?callbackUrl=%2Ffeedback"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/20 px-5 text-[13px] font-semibold text-[#dceade] transition-colors hover:border-[#c8ff93]/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
              {t("Join for free")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-4 text-[11px] leading-6 text-[#91a99a]">
            {t("Available on every plan. Sign in to suggest, vote or comment.")}
          </p>
          <div className="mt-10 space-y-5 border-t border-[#345045] pt-8">
            {steps.map(({number,icon:Icon,title,detail})=>(
              <div key={number} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[#365c46] bg-[#173428] text-[#c8ff93]">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#82a48b]">{t("STEP")} {number}</p>
                  <h3 className="mt-1 text-[14px] font-semibold text-[#f2f8f0]">{t(title)}</h3>
                  <p className="mt-1 text-[12px] leading-[1.75] text-[#a1b8aa]">{t(detail)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-[480px] text-[11px] leading-6 text-[#829c89]">
            {t("Votes help us understand demand, but do not guarantee development. We also weigh usability, security, and impact.")}
          </p>
        </div>
        <CommunityPreview locale={locale}/>
      </div>
    </section>
  );
}
