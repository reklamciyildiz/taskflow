import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingHeroSection } from '@/components/marketing/MarketingHeroSection';
import { MarketingHeroInteractive } from '@/components/marketing/MarketingHeroInteractive';
import { MarketingBento } from '@/components/marketing/MarketingBento';
import { MarketingTrustStrip } from '@/components/marketing/MarketingTrustStrip';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

export default function MarketingPage() {
  return (
    <>
      <MarketingHeader />
      <main className="bg-[#050505]">
        <MarketingHeroSection>
          <MarketingHeroInteractive />
        </MarketingHeroSection>
        <MarketingBento />
        <MarketingTrustStrip />
        <MarketingFooter />
      </main>
    </>
  );
}
