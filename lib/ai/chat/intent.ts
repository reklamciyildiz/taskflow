export type ChatIntent = 'general' | 'knowledge' | 'structured' | 'product_help';

function normalizeIntentText(query: string) {
  return query
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
}

const productHelp = /\b(how (do|can) i|axiom (nasil|nedir)|yardim|help|knowledge hub|planner nasil)\b/i;
const structured = /\b(kac|count|list|listele|hangi action|which action|priority|oncelik|status|stage|asama|due|scheduled|planlanmis|today|bugun|tomorrow|yarin)\b/i;
const knowledge = /\b(notlarim|gecmiste|ogrendim|karar verdik|hatirliyor|my notes|previously|what did (i|we)|what do we know|knowledge|checklist|belgelerim|bilgilerim|axiom bilgiler|workspace|calisma alani|cite|citation|source|kaynak|atif|referans|dogrulama kodu|verification phrase)\b/i;
const workspaceIdentifier = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+\b/;
const smallTalk = /^(hi|hello|hey|merhaba|selam|nasilsin|how are you|thanks|thank you|tesekkurler)[!.? ]*$/i;

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
  return normalized.length >= 12 && !smallTalk.test(normalized);
}

export function fixedProductHelp(query: string): string | null {
  if (/knowledge hub/i.test(query)) {
    return 'Knowledge Hub, erişebildiğiniz Action, Checklist ve Notes içeriklerini tek yerde aramanızı sağlar. Axiom AI içinden soru sorarken mevcut ekip ve Process bağlamını da kullanabilirsiniz.';
  }
  if (/planner/i.test(query)) {
    return 'Planner, planlanmış Action ve Checklist öğelerini Today ve Upcoming görünümlerinde bir araya getirir. Planlama ayarlarını ActionPanel içindeki Schedule kontrolünden değiştirebilirsiniz.';
  }
  return null;
}
