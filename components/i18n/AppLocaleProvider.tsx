'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {toast} from 'sonner';
import {useSession} from 'next-auth/react';
import {APP_INTL_LOCALE,APP_LOCALE_LABELS,DEFAULT_APP_LOCALE,formatAppCurrency,formatAppDate,
  formatAppNumber,isAppLocale,type AppLocale,type TranslationVariables} from '@/lib/i18n/app-locale';
import {translateApp} from '@/lib/i18n/catalog';

const STORAGE_KEY='actiproc:ui-locale';
const readCachedLocale=(key:string|null):AppLocale|null=>{
  if(!key)return null;
  try{
    const candidate=localStorage.getItem(key);
    return isAppLocale(candidate)?candidate:null;
  }catch{return null;}
};
const cacheLocale=(key:string|null,value:AppLocale)=>{
  if(!key)return;
  try{localStorage.setItem(key,value);}catch{/* Browser storage is optional. */}
};
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
  // Scoped to NextAuth identity to prevent a second user on the same browser
  // from inheriting the previous account's language cache. Native auth sessions
  // without a NextAuth email use the server preference without a browser cache.
  const {data:session,status:sessionStatus}=useSession();
  const accountEmail=session?.user?.email;
  const cacheKey=accountEmail?STORAGE_KEY+':'+accountEmail.trim().toLowerCase():null;
  const [locale,setCurrentLocale]=useState<AppLocale>(DEFAULT_APP_LOCALE);
  const [ready,setReady]=useState(false);
  const [saving,setSaving]=useState(false);
  const revision=useRef(0);
  useEffect(()=>{
    if(sessionStatus==='loading')return;
    const requestRevision=++revision.current;
    setReady(false);
    setCurrentLocale(DEFAULT_APP_LOCALE);
    if(sessionStatus==='unauthenticated'){
      setReady(true);
      return;
    }
    const cached=readCachedLocale(cacheKey);
    if(cached)setCurrentLocale(cached);
    const controller=new AbortController();
    void fetch('/api/users/settings',{credentials:'same-origin',cache:'no-store',signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw new Error('locale request failed');
        const body=await response.json();
        if(!body?.success)throw new Error('locale request failed');
        return body?.data?.locale;
      }).then(value=>{
        if(controller.signal.aborted||revision.current!==requestRevision)return;
        if(isAppLocale(value)){
          setCurrentLocale(value);
          cacheLocale(cacheKey,value);
        }
      }).catch(()=>undefined).finally(()=>{
        if(!controller.signal.aborted)setReady(true);
      });
    return ()=>controller.abort();
  },[cacheKey,sessionStatus]);
  useEffect(()=>{
    document.documentElement.lang=locale;
    document.documentElement.dir='ltr';
  },[locale,cacheKey]);
  const setLocale=useCallback(async(next:AppLocale):Promise<boolean>=>{
    if(!isAppLocale(next))return false;
    const myRevision=++revision.current;
    const previous=locale;
    setCurrentLocale(next);
    cacheLocale(cacheKey,next);
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
        cacheLocale(cacheKey,previous);
        toast.error(translateApp(previous,'Language preference could not be saved. Please try again.'));
      }
      return false;
    }finally{
      if(revision.current===myRevision)setSaving(false);
    }
  },[locale,cacheKey]);
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
