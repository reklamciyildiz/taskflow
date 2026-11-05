'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const links = [
  {title:'How it works',href:'#workflow'},
  {title:'Product',href:'#product'},
  {title:'Teams',href:'#teams'},
  {title:'Integrations',href:'#integrations'},
  {title:'Pricing',href:'#pricing'},
] as const;

export function MarketingMobileMenu() {
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
    <div ref={container} className="ap-mobile-nav relative lg:hidden">
      <button type="button" onClick={() => setOpen(value => !value)}
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={open} aria-controls="ap-mobile-marketing-menu"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#3b4b68] bg-[#1a2843] text-[#d4e0f7] transition-colors hover:bg-[#26385b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4cbff]">
        {open ? <X className="h-[18px] w-[18px]" aria-hidden/> : <Menu className="h-[18px] w-[18px]" aria-hidden/>}
      </button>
      {open && (
        <nav id="ap-mobile-marketing-menu" aria-label="Mobile navigation"
          className="absolute right-0 top-[calc(100%+13px)] z-[60] w-[min(290px,calc(100vw-32px))] rounded-2xl border border-[#3a4b69] bg-[#111e34] p-2.5 shadow-[0_28px_70px_-18px_rgba(0,0,0,.65)]">
          {links.map(link=><Link key={link.href} href={link.href} onClick={() => setOpen(false)}
            className="flex min-h-11 items-center rounded-xl px-3 text-[13px] font-medium text-[#d0dcf0] transition-colors hover:bg-[#25375a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4cbff]">
            {link.title}
          </Link>)}
          <Link href="/auth/signin" onClick={() => setOpen(false)}
            className="mt-2 flex min-h-11 items-center rounded-xl border-t border-[#30405e] px-3 text-[13px] font-medium text-[#b0c5ea] hover:bg-[#25375a] sm:hidden">Sign in</Link>
        </nav>
      )}
    </div>
  );
}
