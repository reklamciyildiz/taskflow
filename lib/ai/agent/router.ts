import type { AIChatContext } from '@/lib/ai/chat/types';
import type { AIReadToolCall } from './types';

function normalized(value:string) {
  return value.toLocaleLowerCase('tr-TR').replace(/\u0131/g,'i').replace(/\u015f/g,'s').replace(/\u011f/g,'g')
    .replace(/\u00e7/g,'c').replace(/\u00f6/g,'o').replace(/\u00fc/g,'u').normalize('NFKD').replace(/\p{M}/gu,'');
}

function processNameFromQuestion(question:string):string|undefined {
  // Preserve the original Unicode spelling while recognizing inflected Turkish
  // forms (sürecimde, sürecinin, süreçte) and English Process/Project.
  const patterns=[
    /^\s*(.+?)\s+(?:(?:process|project|proje|s[uü]re[cç])[\p{L}'’]*)(?=\s|[.,?!:]|$)/iu,
    /^\s*(.+?)(?:'ta|'te|'da|'de|’ta|’te|’da|’de)(?=\s|[.,?!:]|$)/iu,
    /^\s*(.+?)\s+(?:projesindeki|projesinde|projectindeki|projectinde)(?=\s|[.,?!:]|$)/iu,
  ];
  for(const pattern of patterns){
    const match=question.match(pattern);
    const value=match?.[1]?.trim();
    if(!value)continue;
    const canonicalHint=value
      .replace(/^(?:benim|bizim|my|our)\s+/iu,'')
      .replace(/\s+(?:isimli|adlı|adli|adındaki|adindaki|named|called)$/iu,'')
      .replace(/^["“”'’]+|["“”'’]+$/gu,'')
      .trim();
    // Deictic references need a verified active Process, never name guessing.
    if(/^(?:bu|şu|su|the|this|my|bizim|benim)$/iu.test(canonicalHint))continue;
    if(canonicalHint&&canonicalHint.length<=120)return canonicalHint;
  }
  return undefined;
}

const call=(name:AIReadToolCall['name'],args:unknown,index:number):AIReadToolCall=>({id:`direct-${index}`,name,arguments:args});

export function planDirectAIReadTools(question:string,context:AIChatContext):AIReadToolCall[] {
  const text=normalized(question),processName=processNameFromQuestion(question);const calls:AIReadToolCall[]=[];
  const selector=context.processId?{processId:context.processId}:processName?{processName}:{};
  if(/\b(kac|how many|listele|list)\b.*\b(process\w*|surec\w*|proje\w*)\b/.test(text)&&!/\b(action\w*|aksiyon\w*|checklist|note|not\w*)\b/.test(text)) {
    calls.push(call('list_processes',{...(context.teamId?{teamId:context.teamId}:{})},calls.length));
  } else if(Object.keys(selector).length && /\b(icerig\w*|icerik\w*|icerisind\w*|ayrinti\w*|detay\w*|notlar\w*|notes|contents?|inside|read|neler var|ne var|what is in|what's in)\b/.test(text)) {
    calls.push(call('get_process_content',{...selector,limit:5},calls.length));
  } else if(/\b(checklist|kontrol listesi)\b/.test(text)&&Object.keys(selector).length) {
    calls.push(call('get_process_overview',selector,calls.length));
  } else if(/\b(planner|planlayici|bugun|yarin|bu hafta|this week|today|tomorrow)\b/.test(text)) {
    const range=/\b(yarin|tomorrow)\b/.test(text)?'tomorrow':/\b(bu hafta|this week)\b/.test(text)?'this_week':'today';
    calls.push(call('get_planner_overview',{range,...(context.teamId?{teamId:context.teamId}:{})},calls.length));
  } else if(/\b(action|aksiyon|isler|isleri|islerim|gorev|gorevler|task)\b/.test(text)&&/\b(kac|hangi|listele|list|tamamlanmamis|yapilmamis|incomplete|open|ozet)\b/.test(text)) {
    const completion=/\b(tamamlanmamis|yapilmamis|incomplete|open)\b/.test(text)?'incomplete':/\b(tamamlanmis|completed|done)\b/.test(text)?'completed':'all';
    calls.push(call('list_actions',{...selector,...(context.teamId?{teamId:context.teamId}:{}),completion,limit:20},calls.length));
  } else if(/\b(process|surec)\b/.test(text)&&/\b(ozet|overview|durum|status)\b/.test(text)&&Object.keys(selector).length) {
    calls.push(call('get_process_overview',selector,calls.length));
  }
  const knowledgeText=processName?normalized(question.replace(processName,'')):text;
  const asksKnowledge=/\b(note|not|gecmis|karar|knowledge|bilgi|ogrend|teknik)\b/.test(knowledgeText);
  if(asksKnowledge&&(calls.length>0||Object.keys(selector).length)) calls.push(call('search_knowledge',{query:question,...selector,...(context.teamId?{teamId:context.teamId}:{}),limit:4},calls.length));
  return calls.slice(0,2);
}

export function shouldUseModelToolSelection(question:string,calls:AIReadToolCall[]) {
  if(calls.length)return false;const text=normalized(question);
  return /\b(process\w*|surec\w*|proje\w*|action\w*|aksiyon\w*|checklist\w*|planner\w*|gorev\w*|task\w*|notlar\w*|icerik\w*)\b/.test(text)&&question.trim().length>=8;
}
