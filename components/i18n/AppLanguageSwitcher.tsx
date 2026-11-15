'use client';

import {Languages,LoaderCircle} from 'lucide-react';
import {useAppLocale} from '@/components/i18n/AppLocaleProvider';
import {APP_LOCALE_LABELS,type AppLocale} from '@/lib/i18n/app-locale';

/** Available in app header; account preference is persisted through the API. */
export function AppLanguageSwitcher({compact=false}:{compact?:boolean}){
  const {locale,setLocale,saving,t}=useAppLocale();
  return <div role="group" aria-label={t('Application language')}
    className={'inline-flex shrink-0 items-center gap-0.5 rounded-xl border bg-card p-1 '+(compact?'':'w-fit')}>
    {!compact&&<Languages className="mx-2 h-4 w-4 text-muted-foreground" aria-hidden="true"/>}
    {(['en','tr'] as const).map(next=><button
      type="button" key={next} lang={next}
      disabled={saving} aria-pressed={locale===next}
      aria-label={APP_LOCALE_LABELS[next]}
      title={APP_LOCALE_LABELS[next]}
      onClick={()=>{if(next!==locale)void setLocale(next);}}
      className={'inline-flex h-8 min-w-10 items-center justify-center rounded-lg px-2 text-[11px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 '+(locale===next?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-accent hover:text-foreground')}>
      {next.toUpperCase()}
    </button>)}
    {saving&&<LoaderCircle className="mx-1 h-3.5 w-3.5 animate-spin" aria-label={t('Saving...')}/>}
  </div>;
}
