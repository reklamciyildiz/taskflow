export type ChatIntent = 'general' | 'knowledge' | 'structured' | 'product_help';

const productHelp = /\b(how (do|can) i|axiom (nasıl|nedir)|yardım|help|knowledge hub|planner nasıl)\b/i;
const structured = /\b(kaç|count|list|listele|hangi action|which action|priority|öncelik|status|stage|aşama|due|scheduled|planlanmış|today|bugün|tomorrow|yarın)\b/i;
const knowledge = /\b(notlarım|geçmişte|öğrendim|karar verdik|hatırlıyor|my notes|previously|what did (i|we)|knowledge|checklist|belgelerim|workspace|çalışma alanı|cite|citation|source|kaynak|atıf|referans)\b/i;
const workspaceIdentifier = /\b[A-Z][A-Za-z0-9]*-\d+\b/;

export function classifyChatIntent(query: string): ChatIntent {
  if (productHelp.test(query)) return 'product_help';
  if (structured.test(query)) return 'structured';
  if (knowledge.test(query) || workspaceIdentifier.test(query)) return 'knowledge';
  return 'general';
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
