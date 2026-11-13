'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect, useState, type MouseEvent} from 'react';
import {Languages} from 'lucide-react';
import type {MarketingLocale} from '@/lib/marketing-locale';

/** Explicit, crawlable locale paths. Preserve the section anchor on switching. */
export function MarketingLanguageSwitcher({locale,compact=false}:{
  locale:MarketingLocale; compact?:boolean;
}) {
  const pathname=usePathname();
  const [hash,setHash]=useState('');
  useEffect(()=>{
    const sync=()=>setHash(window.location.hash||'');
    sync();
    window.addEventListener('hashchange',sync);
    return ()=>window.removeEventListener('hashchange',sync);
  },[pathname]);
  return (
    <nav aria-label={locale==='tr'?'Sayfa dili':'Page language'}
      className={'inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[#46634e] bg-[#173024] p-1 '+(compact?'w-fit':'')}>
      <Languages className="ml-1.5 hidden h-3.5 w-3.5 text-[#aaccaa] sm:block" aria-hidden="true"/>
      {(['en','tr'] as const).map(next=>{
        const href=(next==='tr'?'/marketing/tr':'/marketing')+hash;
        return <Link key={next} href={href} hrefLang={next} lang={next}
          aria-label={next==='tr'?'Türkçe':'English'}
          aria-current={locale===next?'page':undefined}
          onClick={(event:MouseEvent<HTMLAnchorElement>)=>{
            // Use the live anchor, not an out-of-date hash from initial hydration.
            const current=window.location.hash;
            if(current && current!==hash) {
              event.preventDefault();
              window.location.assign((next==='tr'?'/marketing/tr':'/marketing')+current);
            }
          }}
          className={'inline-flex min-h-9 min-w-10 items-center justify-center rounded-full px-2.5 text-[11px] font-bold tracking-[.05em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93] '+
            (locale===next?'bg-[#c8ff93] text-[#143322] shadow-sm':'text-[#bad1be] hover:bg-white/10 hover:text-white')}>
          {next.toUpperCase()}
        </Link>;
      })}
    </nav>
  );
}
