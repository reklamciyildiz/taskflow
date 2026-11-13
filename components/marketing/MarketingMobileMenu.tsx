'use client';

import {MarketingLanguageSwitcher} from './MarketingLanguageSwitcher';
import {marketingT,type MarketingLocale} from '@/lib/marketing-locale';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const links = [
  { title: 'Product tour', href: '#experience' },
  { title: 'How it works', href: '#workflow' },
  { title: 'Everything inside', href: '#product' },
  { title: 'For teams', href: '#teams' },
  { title: 'Integrations', href: '#integrations' },
  { title: 'Community', href: '#community' },
  { title: 'Pricing', href: '#pricing' },
  { title: 'Questions', href: '#faq' },
] as const;

export function MarketingMobileMenu({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnOutsideClick);
    };
  }, [open]);
  return (
    <div ref={container} className="ap-mobile-nav relative xl:hidden">
      <button type="button" onClick={() => setOpen(value => !value)}
        aria-label={t(open ? 'Close navigation menu' : 'Open navigation menu')}
        aria-expanded={open} aria-controls="ap-mobile-marketing-menu"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#3e6549] bg-[#193326] text-[#daf5d0] transition-colors hover:bg-[#284736] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
        {open ? <X className="h-[18px] w-[18px]" aria-hidden /> : <Menu className="h-[18px] w-[18px]" aria-hidden />}
      </button>
      {open && (
        <nav id="ap-mobile-marketing-menu" aria-label={t('Mobile navigation')}
          className="absolute right-0 top-[calc(100%+13px)] z-[60] w-[min(300px,calc(100vw-32px))] rounded-[22px] border border-[#375d43] bg-[#11251b] p-2.5 shadow-[0_28px_70px_-18px_rgba(0,0,0,.72)]">
          {links.map(link => <Link key={link.href} href={link.href} onClick={() => setOpen(false)}
            className="flex min-h-11 items-center rounded-xl px-3 text-[13px] font-medium text-[#c9e6cc] transition-colors hover:bg-[#284b33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
            {t(link.title)}
          </Link>)}
          <div className="px-2 pb-2 pt-3"><MarketingLanguageSwitcher locale={locale} compact/></div>
          <Link href="/auth/signin" onClick={() => setOpen(false)}
            className="mt-2 flex min-h-11 items-center rounded-xl border-t border-[#32503a] px-3 text-[13px] font-medium text-[#d7ffd0] hover:bg-[#284b33] sm:hidden">{t("Sign in")}</Link>
        </nav>
      )}
    </div>
  );
}
