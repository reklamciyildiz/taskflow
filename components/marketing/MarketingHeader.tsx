import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { MarketingMobileMenu } from './MarketingMobileMenu';

const links = [
  { title: 'Product tour', href: '#experience' },
  { title: 'How it works', href: '#workflow' },
  { title: 'Everything inside', href: '#product' },
  { title: 'For teams', href: '#teams' },
  { title: 'Pricing', href: '#pricing' },
] as const;

export function MarketingHeader() {
  return (
    <header className="ap-header sticky top-0 z-50 border-b border-white/10 bg-[#091512]/90 backdrop-blur-2xl">
      <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
        <Link href="/marketing" aria-label="Actiproc home"
          className="group inline-flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[11px] border border-[#466955] bg-[#244433] shadow-[0_6px_24px_-13px_rgba(155,248,145,.8)]">
            <Image src="/icon-192x192.png" alt="" aria-hidden width={36} height={36}
              sizes="36px" className="h-9 w-9 object-cover" priority />
          </span>
          <span className="ap-brand-wordmark text-[19px] font-semibold tracking-[-.055em] text-white">actiproc<span className="text-[#c8ff93]">.</span></span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-0.5 lg:flex">
          {links.map(link => <Link key={link.href} href={link.href}
            className="rounded-full px-3.5 py-2.5 text-[12px] font-medium text-[#bbcec2] transition-colors hover:bg-white/[.085] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
            {link.title}
          </Link>)}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/auth/signin" className="hidden rounded-full px-3 py-2.5 text-[12px] font-semibold text-[#d5e2d6] transition-colors hover:bg-white/[.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] sm:inline-flex">Sign in</Link>
          <Link href="/auth/signup" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#c8ff93] px-4 text-[12px] font-semibold text-[#0a2313] transition-all hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] focus-visible:ring-offset-2 focus-visible:ring-offset-[#091512]">
            Start free <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <MarketingMobileMenu />
        </div>
      </div>
    </header>
  );
}
