import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingHeroSection } from '@/components/marketing/MarketingHeroSection';
import { MarketingHeroInteractive } from '@/components/marketing/MarketingHeroInteractive';
import { MarketingProductShots } from '@/components/marketing/sections/MarketingProductShots';
import { MarketingBento } from '@/components/marketing/MarketingBento';
import { MarketingCoreLoop } from '@/components/marketing/sections/MarketingCoreLoop';
import { MarketingTeamOS } from '@/components/marketing/sections/MarketingTeamOS';
import { MarketingUseCases } from '@/components/marketing/sections/MarketingUseCases';
import { MarketingEnterprise } from '@/components/marketing/sections/MarketingEnterprise';
import { MarketingInsights } from '@/components/marketing/sections/MarketingInsights';
import { MarketingEverythingYouGet } from '@/components/marketing/sections/MarketingEverythingYouGet';
import { MarketingPricing } from '@/components/marketing/sections/MarketingPricing';
import { MarketingSocialProof } from '@/components/marketing/sections/MarketingSocialProof';
import { MarketingTrustStrip } from '@/components/marketing/MarketingTrustStrip';
import { MarketingPwaNote } from '@/components/marketing/sections/MarketingPwaNote';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

export default function MarketingPage() {
  return (
    <>
      <MarketingHeader />
      <main className="bg-[#050505]">
        <MarketingHeroSection>
          <MarketingHeroInteractive />
        </MarketingHeroSection>
        <MarketingProductShots />
        <MarketingBento />
        <MarketingCoreLoop />
        <MarketingTeamOS />
        <MarketingUseCases />
        <MarketingEnterprise />
        <MarketingInsights />
        <MarketingEverythingYouGet />
        <MarketingPricing />
        <MarketingSocialProof />
        <MarketingTrustStrip />
        <MarketingPwaNote />
        <MarketingFooter />
      </main>
    </>
  );
}
