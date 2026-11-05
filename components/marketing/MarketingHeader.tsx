import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Menu } from 'lucide-react';

const links = [
  { title:'How it works', href:'#workflow' },
  { title:'Product', href:'#product' },
  { title:'Teams', href:'#teams' },
  { title:'Integrations', href:'#integrations' },
  { title:'Pricing', href:'#pricing' },
] as const;

export function MarketingHeader() {
  return (
    <header className="ap-header sticky top-0 z-50 border-b border-[#2e3c58]/70 bg-[#0b1326]/90 backdrop-blur-2xl">
      <div className="mx-auto flex h-[70px] max-w-[1250px] items-center justify-between gap-3 px-5 sm:px-8 lg:px-10">
        <Link href="/marketing" aria-label="Actiproc home"
          className="group inline-flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#afc5fc]">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[11px] border border-[#3b5689] bg-[#294576] shadow-[0_6px_24px_-13px_rgba(93,139,247,.9)]">
            <Image src="/icon-192x192.png" alt="" aria-hidden width={36} height={36}
              sizes="36px" className="h-9 w-9 object-cover" priority />
          </span>
          <span className="text-[18px] font-semibold tracking-[-0.045em] text-white">actiproc<span className="text-[#a2beff]">.</span></span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-0.5 lg:flex">
          {links.map(link => <Link key={link.href} href={link.href}
            className="rounded-lg px-3 py-2.5 text-[12px] font-medium text-[#aab8d0] transition-colors hover:bg-white/[0.055] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4cbff]">
            {link.title}
          </Link>)}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/auth/signin" className="hidden rounded-lg px-3 py-2.5 text-[12px] font-semibold text-[#c5d1e8] transition-colors hover:bg-white/[0.055] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4cbff] sm:inline-flex">Sign in</Link>
          <Link href="/auth/signup" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#b9cfff] px-3.5 text-[12px] font-semibold text-[#0b1a32] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4cbff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1326] sm:px-4">
            Get started <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <details className="ap-mobile-nav relative lg:hidden">
            <summary aria-label="Open navigation menu" className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-[#3b4b68] bg-[#1a2843] text-[#d4e0f7] transition-colors hover:bg-[#26385b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4cbff] [&::-webkit-details-marker]:hidden">
              <Menu className="h-[18px] w-[18px]" aria-hidden />
            </summary>
            <nav aria-label="Mobile navigation" className="absolute right-0 top-[calc(100%+13px)] z-[60] w-[min(290px,calc(100vw-32px))] rounded-2xl border border-[#3a4b69] bg-[#111e34] p-2.5 shadow-[0_28px_70px_-18px_rgba(0,0,0,.65)]">
              {links.map(link=><Link key={link.href} href={link.href}
                className="flex min-h-11 items-center rounded-xl px-3 text-[13px] font-medium text-[#d0dcf0] hover:bg-[#25375a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4cbff]">
                {link.title}
              </Link>)}
              <Link href="/auth/signin" className="mt-2 flex min-h-11 items-center rounded-xl border-t border-[#30405e] px-3 text-[13px] font-medium text-[#b0c5ea] hover:bg-[#25375a] sm:hidden">Sign in</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
