import {marketingT,type MarketingLocale} from '@/lib/marketing-locale';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';

const groups = [
  {title:'Explore', items:[
    {label:'How it works',href:'#workflow'},
    {label:'Product',href:'#product'},
    {label:'Teams',href:'#teams'},
    {label:'Community & feedback',href:'#community'},
    {label:'Pricing',href:'#pricing'},
  ]},
  {title:'Get started',items:[
    {label:'Create account',href:'/auth/signup'},
    {label:'Sign in',href:'/auth/signin'},
    {label:'Integrations',href:'#integrations'},
    {label:'Suggest a feature',href:'/feedback'},
  ]},
  {title:'Legal',items:[
    {label:'Privacy',href:'/privacy'},
    {label:'Terms of service',href:'/terms'},
    {label:'Refund policy',href:'/refunds'},
  ]},
] as const;

export function MarketingFooter({locale='en'}:{locale?:MarketingLocale}) {
  const t=marketingT(locale);
  return (
    <footer className="border-t border-[#2e4839] bg-[#091711] pb-8 pt-16 text-[#9dacca] sm:pt-20">
      <div className="mx-auto max-w-[1250px] px-5 sm:px-8 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)] lg:gap-16">
          <div>
            <Link href={locale==='tr'?'/marketing/tr':'/marketing'} className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-[#466850] bg-[#285237]">
                <Image src="/icon-192x192.png" alt="" aria-hidden width={36} height={36} sizes="36px" className="h-9 w-9 object-cover" />
              </span>
              <span className="text-xl font-semibold tracking-[-0.045em] text-white">actiproc<span className="text-[#c8ff93]">.</span></span>
            </Link>
            <p className="mt-5 max-w-[360px] text-[14px] leading-[1.85] text-[#a9bfac]">
              {t("The connected workspace for everything between an idea and an outcome.")}
            </p>
            <Link href="/auth/signup" className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-[#c8ff93] transition-colors hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">
              {t("Create your workspace")} <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
            {groups.map(group => <div key={t(group.title)}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#dce6fb]">{t(group.title)}</h3>
              <ul className="mt-5 space-y-3.5">
                {group.items.map(item=><li key={item.href}>
                  <Link href={item.href} className="text-[13px] text-[#a9c4ae] transition-colors hover:text-white focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8ff93]">{t(item.label)}</Link>
                </li>)}
              </ul>
            </div>)}
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-3 border-t border-[#2e4936] pt-6 text-[11px] text-[#7185a6] sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Actiproc. {t("All rights reserved.")}</span>
          <span>{t("Everything moves together.")}</span>
        </div>
      </div>
    </footer>
  );
}
