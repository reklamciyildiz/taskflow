import { inferAIChatLanguage } from './language';
export type ChatIntent = 'general' | 'knowledge' | 'structured' | 'product_help';

function normalizeIntentText(query: string) {
  return query
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
}

const productHelp = /\b(how (do|can) i|(axiom|actiproc) (nasil|nedir)|yardim|help|knowledge hub|planner nasil)\b/i;
const structured = /\b(kac|toplam|say|count|list|listele\w*|hangi action|hangi aksiyon|which action|priority|oncelik\w*|status|stage|asama\w*|durum\w*|due|scheduled|planlanmis|today|bugun|tomorrow|yarin)\b/i;
const knowledge = /\b(notlar\w*|gecmis\w*|ogrend\w*|karar\w*|hatirla\w*|my notes|previously|what did (i|we)|what do we know|knowledge|checklist|belge\w*|bilgi\w*|dokuman\w*|icerik\w*|(axiom|actiproc) bilgiler|workspace|calisma alani|cite|citation|source|kaynak\w*|atif|referans\w*|dogrulama kodu|verification phrase)\b/i;
const workspaceIdentifier = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+\b/;
const smallTalk = /^(hi|hello|hey|merhaba|selam|nasilsin|how are you|thanks|thank you|tesekkurler)[!.? ]*$/i;
const workspaceSignal = /\b(action\w*|aksiyon\w*|checklist\w*|note\w*|notlar\w*|process\w*|surec\w*|task\w*|gorev\w*|kart\w*|workspace|knowledge hub|planner|project\w*|proje\w*|dogrulama kodu|verification phrase)\b/i;
const ownershipSignal = /\b(benim|bizim|bende|bizde|my|our|we|gecmis|geçmiş|kayit|kayıt)\b/i;

export function classifyChatIntent(query: string): ChatIntent {
  const normalized = normalizeIntentText(query);
  if (productHelp.test(normalized)) return 'product_help';
  if (structured.test(normalized)) return 'structured';
  if (knowledge.test(normalized) || workspaceIdentifier.test(query)) return 'knowledge';
  return 'general';
}

/**
 * Ambiguous, non-trivial questions get a high-threshold workspace lookup.
 * This keeps greetings cheap while avoiding a brittle requirement for users
 * to say "my notes" or "cite the source" before Axiom can find their data.
 */
export function shouldAttemptKnowledgeRetrieval(query: string, intent: ChatIntent) {
  if (intent === 'knowledge') return true;
  if (intent !== 'general') return false;
  const normalized = normalizeIntentText(query).trim();
  return normalized.length >= 12 && !smallTalk.test(normalized)
    && (workspaceSignal.test(normalized)||ownershipSignal.test(normalized)||workspaceIdentifier.test(query));
}

export function fixedProductHelp(query: string): string | null {
  if (/knowledge hub/i.test(query)) {
    return inferAIChatLanguage(query)==='en'
      ? 'Knowledge Hub searches the Actions, Checklists and Notes you are authorized to access. Actiproc AI can also use your current Team and Process context.'
      : 'Knowledge Hub, erişebildiğiniz Action, Checklist ve Notes içeriklerini tek yerde aramanızı sağlar. Actiproc AI içinden soru sorarken mevcut ekip ve Process bağlamını da kullanabilirsiniz.';
  }
  if (/planner/i.test(query)) {
    return inferAIChatLanguage(query)==='en'
      ? 'Planner brings scheduled Actions and Checklist items together in Today and Upcoming. You can change scheduling from the Schedule control in an Action.'
      : 'Planner, planlanmış Action ve Checklist öğelerini Today ve Upcoming görünümlerinde bir araya getirir. Planlama ayarlarını ActionPanel içindeki Schedule kontrolünden değiştirebilirsiniz.';
  }
  return null;
}
