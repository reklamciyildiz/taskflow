export function formatAIQuotaMessage(reason:string|undefined,resetAt:Date):string {
  const resetLabel=new Intl.DateTimeFormat('tr-TR',{
    timeZone:'Europe/Istanbul',dateStyle:'medium',timeStyle:'short',
  }).format(resetAt);
  const normalized=(reason??'AI request quota exhausted').toLowerCase();
  if (normalized.includes('daily')) {
    return `Günlük AI istek limitine ulaştınız. Kota ${resetLabel} (Türkiye saati) yenilenir.`;
  }
  if (normalized.includes('monthly')) {
    return `Aylık organizasyon AI istek limitine ulaşıldı. Kota ${resetLabel} (Türkiye saati) yenilenir.`;
  }
  return `${reason??'AI kullanım limiti doğrulanamadı'} Yeniden deneme zamanı: ${resetLabel} (Türkiye saati).`;
}

const refundableFailureCodes=new Set([
  'CANCELLED','CITATION_REQUIRED','PROVIDER_RATE_LIMITED','PROVIDER_TIMEOUT',
  'PROVIDER_CONFIGURATION','AI_UNAVAILABLE',
]);

export function shouldRefundAIUserQuota(input:{ billableAttempt:boolean;errorCode:string }):boolean {
  return !input.billableAttempt||refundableFailureCodes.has(input.errorCode);
}
