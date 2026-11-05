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

/**
 * Product-led editorial storytelling with interactive illustrative experiences.
 * The page remains a Server Component; only the interactive client showcases hydrate.
 */
export default function MarketingPage() {
  return (
    <>
      <a href="#main-content" className="ap-skip-link">Skip to main content</a>
      <MarketingHeader />
      <main id="main-content" className="min-w-0 overflow-x-clip bg-[#091512]">
        <MarketingHero />
        <MarketingWorkflow />
        <MarketingProductSystem />
        <MarketingConnectedWorkspace />
        <MarketingIntegrations />
        <MarketingPricing />
        <MarketingFAQ />
        <MarketingFinalCta />
      </main>
      <MarketingFooter />
    </>
  );
}
