/** Centralized application localization; add new language catalogs here, not page-local toggles. */
export const APP_LOCALES = ['en','tr'] as const;
export type AppLocale = typeof APP_LOCALES[number];
export const DEFAULT_APP_LOCALE:AppLocale='en';
export const APP_LOCALE_LABELS:Record<AppLocale,string>={en:'English',tr:'Türkçe'};
export function isAppLocale(value:unknown):value is AppLocale{
  return value==='en'||value==='tr';
}
export const APP_INTL_LOCALE:Record<AppLocale,string>={en:'en-US',tr:'tr-TR'};
export type TranslationVariables=Record<string,string|number|boolean>;

export function interpolateText(value:string,values?:TranslationVariables){
  if(!values)return value;
  return value.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
    (full,key:string)=>Object.prototype.hasOwnProperty.call(values,key)?String(values[key]):full);
}
export function formatAppDate(locale:AppLocale,date:Date|string|number,
  options?:Intl.DateTimeFormatOptions):string{
  const dt=date instanceof Date?date:new Date(date);
  if(Number.isNaN(dt.getTime()))return '';
  return new Intl.DateTimeFormat(APP_INTL_LOCALE[locale],
    options??{year:'numeric',month:'short',day:'numeric'}).format(dt);
}
export function formatAppNumber(locale:AppLocale,value:number,options?:Intl.NumberFormatOptions){
  return new Intl.NumberFormat(APP_INTL_LOCALE[locale],options).format(value);
}
export function formatAppCurrency(locale:AppLocale,amount:number,currency='USD'){
  return new Intl.NumberFormat(APP_INTL_LOCALE[locale],
    {style:'currency',currency}).format(amount);
}
