'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {toast} from 'sonner';
import {APP_INTL_LOCALE,APP_LOCALE_LABELS,DEFAULT_APP_LOCALE,formatAppCurrency,formatAppDate,
  formatAppNumber,isAppLocale,type AppLocale,type TranslationVariables} from '@/lib/i18n/app-locale';
import {translateApp} from '@/lib/i18n/catalog';

const STORAGE_KEY='actiproc:ui-locale';
type ContextValue={
  locale:AppLocale;ready:boolean; saving:boolean;
  setLocale:(locale:AppLocale)=>Promise<boolean>;
  t:(text:string,variables?:TranslationVariables)=>string;
  date:(value:Date|string|number,options?:Intl.DateTimeFormatOptions)=>string;
  number:(value:number,options?:Intl.NumberFormatOptions)=>string;
  money:(amount:number,currency?:string)=>string;
};
const fallback:ContextValue={
  locale:DEFAULT_APP_LOCALE,ready:false,saving:false,setLocale:async()=>false,
  t:(text,values)=>translateApp('en',text,values),
  date:(value,opts)=>formatAppDate('en',value,opts),
  number:(value,opts)=>formatAppNumber('en',value,opts),
  money:(value,currency)=>formatAppCurrency('en',value,currency),
};
const AppLocaleContext=createContext<ContextValue>(fallback);

export function AppLocaleProvider({children}:{children:ReactNode}){
  const [locale,setCurrentLocale]=useState<AppLocale>(DEFAULT_APP_LOCALE);
  const [ready,setReady]=useState(false);
  const [saving,setSaving]=useState(false);
  const revision=useRef(0);
  useEffect(()=>{
    const cache=localStorage.getItem(STORAGE_KEY);
    if(isAppLocale(cache))setCurrentLocale(cache);
    const controller=new AbortController();
    void fetch('/api/users/settings',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw new Error('locale request failed');
        const body=await response.json();
        if(!body?.success)throw new Error('locale request failed');
        return body?.data?.locale;
      }).then(value=>{
        if(controller.signal.aborted||revision.current!==0)return;
        if(isAppLocale(value)){
          setCurrentLocale(value);
          localStorage.setItem(STORAGE_KEY,value);
        }
      }).catch(()=>undefined).finally(()=>{if(!controller.signal.aborted)setReady(true);});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    document.documentElement.lang=locale;
    document.documentElement.dir='ltr';
  },[locale]);
  const setLocale=useCallback(async(next:AppLocale):Promise<boolean>=>{
    if(!isAppLocale(next))return false;
    const myRevision=++revision.current;
    const previous=locale;
    setCurrentLocale(next);
    localStorage.setItem(STORAGE_KEY,next);
    setSaving(true);
    try{
      const response=await fetch('/api/users/settings',{
        method:'PATCH',headers:{'Content-Type':'application/json'},
        credentials:'same-origin',cache:'no-store',body:JSON.stringify({locale:next}),
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.success||payload?.data?.locale!==next)
        throw new Error('Could not save language preference');
      return true;
    }catch{
      if(revision.current===myRevision){
        setCurrentLocale(previous);
        localStorage.setItem(STORAGE_KEY,previous);
        toast.error(translateApp(previous,'Language preference could not be saved. Please try again.'));
      }
      return false;
    }finally{
      if(revision.current===myRevision)setSaving(false);
    }
  },[locale]);
  const value=useMemo<ContextValue>(()=>({
    locale,ready,saving,setLocale,
    t:(text,values)=>translateApp(locale,text,values),
    date:(v,opts)=>formatAppDate(locale,v,opts),
    number:(v,opts)=>formatAppNumber(locale,v,opts),
    money:(amount,currency)=>formatAppCurrency(locale,amount,currency),
  }),[locale,ready,saving,setLocale]);
  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}
export function useAppLocale(){return useContext(AppLocaleContext);}
/** Localize static UI text without changing parents' state or translating user content. */
export function T({text,values}:{text:string;values?:TranslationVariables}){
  const {t}=useAppLocale();
  return <>{t(text,values)}</>;
}
export function LocaleLabel({language}:{language:AppLocale}){
  return <>{APP_LOCALE_LABELS[language]}</>;
}
