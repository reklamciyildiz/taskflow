import type {MarketingLocale} from '@/lib/marketing-locale';
import {marketingT} from '@/lib/marketing-locale';
import {MarketingDocumentLanguage} from '@/components/marketing/MarketingDocumentLanguage';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import {
  MarketingHero,
  MarketingWorkflow,
  MarketingProductSystem,
  MarketingConnectedWorkspace,
  MarketingIntegrations,
  MarketingFinalCta,
  MarketingFAQ,
} from '@/components/marketing/MarketingExperience';
import { MarketingPricing } from '@/components/marketing/sections/MarketingPricing';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MarketingFeedbackCommunity } from '@/components/marketing/MarketingFeedbackCommunity';

/**
 * Product-led editorial storytelling with interactive illustrative experiences.
 * The page remains a Server Component; only the interactive client showcases hydrate.
 */
export default function MarketingPage({locale='en'}:{locale?:MarketingLocale}={}) {
  const t=marketingT(locale);
  return (
    <>
      <MarketingDocumentLanguage locale={locale}/>
      <a href="#main-content" className="ap-skip-link">{t('Skip to main content')}</a>
      <MarketingHeader locale={locale} />
      <main id="main-content" className="min-w-0 overflow-x-clip bg-[#091512]">
        <MarketingHero locale={locale} />
        <MarketingWorkflow locale={locale} />
        <MarketingProductSystem locale={locale} />
        <MarketingConnectedWorkspace locale={locale} />
        <MarketingIntegrations locale={locale} />
        <MarketingFeedbackCommunity locale={locale} />
        <MarketingPricing locale={locale} />
        <MarketingFAQ locale={locale} />
        <MarketingFinalCta locale={locale} />
      </main>
      <MarketingFooter locale={locale} />
    </>
  );
}
