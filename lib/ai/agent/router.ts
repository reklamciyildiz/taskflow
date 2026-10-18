import type { AIChatContext } from '@/lib/ai/chat/types';
import type { AIReadToolCall } from './types';

function normalized(value:string) {
  return value.toLocaleLowerCase('tr-TR').replace(/\u0131/g,'i').replace(/\u015f/g,'s').replace(/\u011f/g,'g')
    .replace(/\u00e7/g,'c').replace(/\u00f6/g,'o').replace(/\u00fc/g,'u').normalize('NFKD').replace(/\p{M}/gu,'');
}

function processNameFromQuestion(question:string):string|undefined {
  const patterns=[
    /^\s*(.+?)\s+(?:process(?:['\u2019]?(?:im|imde|imdeki|inde|indeki))?|surec(?:['\u2019]?(?:im|imde|imdeki|inde|indeki))?)\b/i,
    /^\s*(.+?)(?:'ta|'te|'da|'de|\u2019ta|\u2019te|\u2019da|\u2019de)\s+/i,
    /^\s*(.+?)\s+(?:projesindeki|projesinde|projectindeki|projectinde)\b/i,
  ];
  for(const pattern of patterns){const match=question.match(pattern);const value=match?.[1]?.trim();if(value&&value.length<=120)return value;}
  return undefined;
}

const call=(name:AIReadToolCall['name'],args:unknown,index:number):AIReadToolCall=>({id:`direct-${index}`,name,arguments:args});

export function planDirectAIReadTools(question:string,context:AIChatContext):AIReadToolCall[] {
  const text=normalized(question),processName=processNameFromQuestion(question);const calls:AIReadToolCall[]=[];
  const selector=context.processId?{processId:context.processId}:processName?{processName}:{};
  if(/\b(kac|how many|listele|list)\b.*\b(process|surec)\b/.test(text)&&!/\b(action|checklist|note|not)\b/.test(text)) {
    calls.push(call('list_processes',{...(context.teamId?{teamId:context.teamId}:{})},calls.length));
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
  return /\b(process|surec|action|aksiyon|checklist|planner|gorev|task)\b/.test(text)&&question.trim().length>=8;
}
