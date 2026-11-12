import type { AIChatContext } from '@/lib/ai/chat/types';
import type { AIReadToolCall } from './types';
import { selectRequestedActionCount } from './scoped-action-access';
import { inferAIChatLanguage } from '@/lib/ai/chat/language';

function normalized(value:string) {
  return value.toLocaleLowerCase('tr-TR').replace(/\u0131/g,'i').replace(/\u015f/g,'s').replace(/\u011f/g,'g')
    .replace(/\u00e7/g,'c').replace(/\u00f6/g,'o').replace(/\u00fc/g,'u').normalize('NFKD').replace(/\p{M}/gu,'');
}

function processNameFromQuestion(question:string):string|undefined {
  // Preserve the original Unicode spelling while recognizing inflected Turkish
  // forms (sürecimde, sürecinin, süreçte) and English Process/Project.
  const englishHave=question.match(/^\s*(?:i have|we have|my|our|do you know|have you seen)\s+(.+?)\s+(?:process|project)\b/iu);
  if(englishHave?.[1] && englishHave[1].trim().length<=120)return englishHave[1].trim();
  const englishIn=question.match(/^\s*(?:please\s+)?(?:show|read|summarize|explain|give|tell)\b.*?\b(?:in|of|inside|from)\s+(.+?)\s+(?:process|project)\b/iu);
  if(englishIn?.[1] && englishIn[1].trim().length<=120)return englishIn[1].trim();
  const patterns=[
    /^\s*(.+?)\s+(?:(?:process|project|proje|s[uü]re[cç])[\p{L}'’]*)(?=\s|[.,?!:]|$)/iu,
    /^\s*(.+?)(?:'taki|'teki|'daki|'deki|'ta|'te|'da|'de|’taki|’teki|’daki|’deki|’ta|’te|’da|’de)(?=\s|[.,?!:]|$)/iu,
    /^\s*(.+?)\s+(?:projesindeki|projesinde|projectindeki|projectinde)(?=\s|[.,?!:]|$)/iu,
  ];
  for(const pattern of patterns){
    const match=question.match(pattern);
    const value=match?.[1]?.trim();
    if(!value)continue;
    const canonicalHint=value
      .replace(/^(?:(?:benim|bizim|my|our|lütfen|lutfen|bana|please)\s+)+/iu,'')
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

/** Model-free, multilingual routing for common grounded workspace queries. */
export function planDirectAIReadTools(question:string,context:AIChatContext):AIReadToolCall[] {
  const text=normalized(question),processName=processNameFromQuestion(question);
  const calls:AIReadToolCall[]=[];
  const selector=context.processId?{processId:context.processId}:processName?{processName}:{};
  const team=context.teamId?{teamId:context.teamId}:{};
  const actionWords=/\b(actions?|aksiyon\w*|isler\w*|gorev\w*|tasks?)\b/;
  // The LLM planner handles open-ended language. This fast path recognizes
  // canonical Note nouns, including inflected Turkish singular 'not', without
  // treating English negation ('not') as a Note request.
  const hasNote=/\b(notes?\w*|notlar\w*|notum\w*|notlarim\w*)\b/.test(text)
    ||(/\bnot\b/.test(text)&&(
      inferAIChatLanguage(question)==='tr'
      ||/\b(son|benim|hangisi|hakkinda|aldigim|yazdigim|ekledigim|olusturdugum|ne)\b/.test(text)
    ));
  const recentWords=/\b(recent|recently|last|latest|newest|son|en son|sonuncu|yeni|gecmis|gecmiste|yaptiklarim\w*|yaptigim\w*|aktivit\w*|faaliyet\w*)\b/;
  const asksRecentActivity=/\b(activity|activities|work logs?|calismalarim\w*|yaptiklarim\w*|yaptigim\w*|aktivit\w*|faaliyet\w*|what (?:you|i) did|what did (?:you|i) do)\b/;
  const asksList=/\b(kac|hangi|listele\w*|list|names?|name|give|provide|show|tell|goster\w*|sirala\w*|ozet\w*|summary|summarize|what|neler|ne var|how many|hangileri|which|tamamlanmamis|yapilmamis|incomplete|open|first|top|last|latest|be[sş]|five|three|\d+)\b/;
  const containsContentRequest=/\b(icerig\w*|icerik\w*|icerisind\w*|ayrinti\w*|detay\w*|contents?|inside|read|oku\w*|neler var|ne var|what is in|what's in)\b/.test(text);
  const notesOnly=hasNote&&!actionWords.test(text);
  const requestsRecent=(recentWords.test(text)||asksRecentActivity.test(text))
    &&(hasNote||actionWords.test(text)||asksRecentActivity.test(text));
  const noteTopicMatch=notesOnly ? question.match(/^\s*(?:benim\s+)?(.+?)\s+hakk(?:ında|inda|ındaki|indaki)\s+notlar/iu)
    ?? question.match(/\babout\s+(.+?)\s*[?.!]?$/iu) : null;
  const noteTopic=noteTopicMatch?.[1]?.replace(/^(?:what is|what are|my|benim)\s+/iu,'').trim();
  const noteSearch=Boolean(noteTopic&&noteTopic.length<=120);
  const listRecentNotes=notesOnly&&!Object.keys(selector).length&&(asksList.test(text)||noteSearch)
    &&/\b(my|mine|benim|son|en son|latest|last|recent|listele\w*|list|show|goster\w*|about|hakkinda)\b/.test(text);
  const combinedProcessResearch=Boolean(processName&&actionWords.test(text)&&hasNote
    &&/\b(karar\w*|degerlendir\w*|analyze|analysis|compare|karsilastir\w*)\b/.test(text));
  const noteAnalysis=/\b(analiz\w*|cikarim\w*|degerlendir\w*|karsilastir\w*|oner\w*|insight\w*|conclusion\w*|analy[sz]\w*|compare\w*|summari[sz]\w*|ozetle\w*)\b/.test(text);
  const noteOwned=/\b(benim|bana|aldigim|yazdigim|ekledigim|olusturdugum|notlarim\w*|notum\w*|my|mine|i wrote|i added)\b/.test(text);
  const groupNotes=/\b(notlarimiz\w*|bizim|ekibimiz\w*|our|ours|team)\b/.test(text);
  const latestNoteRequest=notesOnly&&recentWords.test(text)&&!asksRecentActivity.test(text);
  const lastEdited=/\b(duzenle\w*|degistir\w*|guncelle\w*|edit\w*|modified|updated)\b/.test(text);
  const singularNote=/\b(note|not|notum|notumu|my note|my last note)\b/.test(text)
    &&!/\b(notes|notlar\w*)\b/.test(text);
  if(combinedProcessResearch) {
    calls.push(call('list_actions',{...selector,...team,completion:'all',limit:20},calls.length));
    calls.push(call('search_knowledge',{query:question,...selector,...team,limit:4},calls.length));
  } else if((latestNoteRequest||listRecentNotes||noteSearch)&&!asksRecentActivity.test(text)
    &&(!Object.keys(selector).length || latestNoteRequest)) {
    calls.push(call('get_notes',{
      ...selector,...team,
      ...(noteSearch?{query:noteTopic}:{}),
      authorScope:groupNotes?'accessible':noteOwned?'mine':'accessible',
      sort:lastEdited?'updated_desc':'created_desc',
      limit:singularNote?1:Math.min(15,selectRequestedActionCount(question,5)),
      answerStyle:noteAnalysis?'analysis':'list',
    },calls.length));
  } else if(requestsRecent) {
    calls.push(call('get_recent_workspace',{...selector,...team,
      ...(noteSearch?{query:noteTopic}:{}),
      focus:asksRecentActivity.test(text)?'all':notesOnly?'notes':actionWords.test(text)&&!hasNote?'actions':'all',
      limit:Math.min(15,selectRequestedActionCount(question,8))},calls.length));
  } else if(/\b(kac|how many|listele|list)\b.*\b(process\w*|surec\w*|proje\w*)\b/.test(text)
    &&!actionWords.test(text)&&!hasNote) {
    calls.push(call('list_processes',{...team},calls.length));
  } else if(Object.keys(selector).length&&(containsContentRequest||notesOnly)) {
    calls.push(call('get_process_content',{...selector,limit:5},calls.length));
  } else if(/\b(checklist|kontrol listesi)\b/.test(text)&&Object.keys(selector).length) {
    calls.push(call('get_process_overview',selector,calls.length));
  } else if(/\b(planner|planlayici|bugun|yarin|bu hafta|this week|today|tomorrow)\b/.test(text)) {
    const range=/\b(yarin|tomorrow)\b/.test(text)?'tomorrow':/\b(bu hafta|this week)\b/.test(text)?'this_week':'today';
    calls.push(call('get_planner_overview',{range,...team},calls.length));
  } else if(actionWords.test(text)&&asksList.test(text)) {
    const completion=/\b(tamamlanmamis|yapilmamis|incomplete|open)\b/.test(text)?'incomplete'
      :/\b(tamamlanmis|completed|done)\b/.test(text)?'completed':'all';
    calls.push(call('list_actions',{...selector,...team,completion,limit:selectRequestedActionCount(question,20)},calls.length));
  } else if(/\b(process|surec)\b/.test(text)&&/\b(ozet|overview|durum|status)\b/.test(text)&&Object.keys(selector).length) {
    calls.push(call('get_process_overview',selector,calls.length));
  } else if(Object.keys(selector).length&&/\b(process|surec|proje|project)\b/.test(text)) {
    calls.push(call('get_process_overview',selector,calls.length));
  }
  const knowledgeText=processName?normalized(question.replace(processName,'')):text;
  const asksKnowledge=/\b(note|notlar\w*|gecmis|karar|knowledge|bilgi|ogrend|teknik)\b/.test(knowledgeText);
  // Fresh canonical recent notes need no stale-index lookup.
  if(!requestsRecent&&!listRecentNotes&&asksKnowledge&&(calls.length>0||Object.keys(selector).length)) {
    calls.push(call('search_knowledge',{query:question,...selector,...team,limit:4},calls.length));
  }
  return calls.slice(0,2);
}

/**
 * Open-ended, model-led discovery. This is deliberately NOT a dictionary of
 * every possible user's phrase. Ambiguous personal/workspace questions invoke
 * a read-only tool selector that may choose no tool. Direct, exact lookups
 * above avoid an extra provider request.
 */
export function shouldUseModelToolSelection(
  question:string,
  calls:AIReadToolCall[],
  context?:AIChatContext,
):boolean {
  if(calls.length)return false;
  const text=normalized(question).trim();
  if(text.length<8)return false;
  if(/^(?:hi|hello|hey|merhaba|selam|thanks|thank you|tesekkurler|ok|tamam)[!.? ]*$/.test(text))return false;
  // Data-domain hints are only a cheap signal; the selector infers intent
  // semantically rather than relying on a manually maintained phrase list.
  const workspace=/\b(process\w*|surec\w*|proje\w*|actions?\w*|aksiyon\w*|checklist\w*|planner\w*|gorev\w*|tasks?\w*|notes?\w*|notlar\w*|knowledge\w*|workspaces?\w*|dosya\w*|belge\w*|karar\w*)\b/.test(text);
  const personal=/\b(benim|bende|bana|benden|bizim|bizde|bize|my|mine|our|ours|we|previously|recently|yaptigim\w*|yazdigim\w*|olusturdugum\w*)\b/.test(text);
  const followUp=Boolean(context?.processId||context?.teamId);
  return workspace||personal||followUp;
}
