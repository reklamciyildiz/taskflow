'use client';
import {useEffect} from 'react';
import type {MarketingLocale} from '@/lib/marketing-locale';
export function MarketingDocumentLanguage({locale}:{locale:MarketingLocale}){
  useEffect(()=>{
    const prior=document.documentElement.lang;
    document.documentElement.lang=locale;
    return ()=>{document.documentElement.lang=prior;};
  },[locale]);
  return null;
}
