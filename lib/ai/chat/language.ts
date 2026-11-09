/**
 * Infer the language of the latest user turn, rather than the (mostly English)
 * workspace schema. Turkish ASCII spelling and inflected words are common in
 * Actiproc, so diacritics alone are not a reliable signal.
 */
export type AIChatLanguage = 'tr' | 'en' | 'auto';

function normalize(value:string) {
  return value.toLocaleLowerCase('tr-TR')
    .replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ş/g,'s')
    .replace(/ç/g,'c').replace(/ö/g,'o').replace(/ü/g,'u')
    .normalize('NFKD').replace(/\p{M}/gu,'');
}

const TURKISH = /\b(?:benim|bizim|bana|bende|bunu|bunun|bunlari|hangi|kac|neden|nasil|neler|var|yok|misin|miyim|miyiz|lutfen|selam|merhaba|nasilsin|sagol|tesekkur\w*|surec\w*|aksiyon\w*|gorev\w*|isler\w*|notlar\w*|icerik\w*|icerig\w*|aciklama\w*|karar\w*|ozetle\w*|listele\w*|goster\w*|olustur\w*|ekle\w*|planla\w*|tamamla\w*|kontrol\w*|yapil\w*|bulunan|bulunuyor|hakkinda|incele\w*)\b/gu;
const ENGLISH = /\b(?:please|hello|thanks|thank|what|which|where|when|why|how|can|could|would|should|show|list|summarize|explain|read|find|about|inside|contents?|tasks?|my|our|the|this|with|does|have|are|is)\b/gu;

export function inferAIChatLanguage(question:string):AIChatLanguage {
  const text=normalize(question);
  const tr=(text.match(TURKISH)??[]).length;
  const en=(text.match(ENGLISH)??[]).length;
  if(tr>0 && tr>=en)return 'tr';
  if(en>0 && en>tr)return 'en';
  return 'auto';
}
