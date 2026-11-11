import { inferAIChatLanguage } from '@/lib/ai/chat/language';
import type { AIReadToolExecution } from './types';

type ActionRow = { title:string; processName?:string|null; stageLabel?:string|null; updatedAt?:string };
type NoteRow = { title:string; preview?:string|null; actionTitle?:string|null; processName?:string|null; updatedAt?:string|null };

/**
 * Direct verified answers for simple read-only queries. Provider outages or
 * hallucinations cannot turn verified records into claims of "no access".
 */
export function renderCanonicalWorkspaceAnswer(
  question:string,
  executions:readonly AIReadToolExecution[],
): string | null {
  if(executions.length!==1) return null;
  const execution=executions[0];
  const data=execution.data as Record<string,unknown>|null;
  if(!data||typeof data!=='object'||typeof data.error==='string')return null;
  const turkish=inferAIChatLanguage(question)==='tr';

  if(execution.name==='list_actions') {
    const actions=Array.isArray(data.actions)?data.actions as ActionRow[]:[];
    const partial=data.partialScan===true;
    const total=typeof data.total==='number'?data.total:null;
    if(!actions.length) return turkish
      ? partial
        ? 'Görünür Action taraması kısmi kaldı; kesin sıfır sonucunu doğrulayamıyorum. Daha dar bir Process seçin.'
        : 'Erişiminiz olan bu kapsamda eşleşen Action bulunamadı. İlgili Team ve Process seçimini kontrol edin.'
      : partial
        ? 'The Action scan is partial. I cannot verify a zero result; try a specific Process.'
        : 'No matching Actions were found in your accessible scope.';
    const output:string[]=[turkish
      ? 'Erişiminiz olan güncel Action kayıtlarından '+actions.length+' tanesi:'
      : 'Here are '+actions.length+' current Actions in your authorized workspace:'];
    actions.forEach((row,index)=>{
      const suffix=(row.processName?' ('+row.processName+')':'')
        +(row.stageLabel&&/\b(stage|aşama|asama|durum|status)\b/iu.test(question)?' — '+row.stageLabel:'');
      output.push(String(index+1)+'. **'+row.title+'**'+suffix);
    });
    if(partial)output.push(turkish
      ? '**Not:** Arama kısmi; liste kesin toplam olarak yorumlanmamalı.'
      : '**Note:** This is a partial scan, not a verified total.');
    else if(total!==null)output.push(turkish
      ? 'Eşleşen toplam: **'+total+'**.'
      : 'Total matching: **'+total+'**.');
    return output.join('\n');
  }

  if(execution.name==='get_recent_workspace') {
    const actions=Array.isArray(data.latestActions)?data.latestActions as ActionRow[]:[];
    const notes=Array.isArray(data.latestNotes)?data.latestNotes as NoteRow[]:[];
    const focus=data.focus;
    const lines:string[]=[];
    if(focus!=='notes') {
      lines.push(turkish?'**Son güncellenen Action’lar**':'**Recently updated Actions**');
      if(!actions.length)lines.push(turkish?'Bu kapsamda güncel Action bulunamadı.':'No recent Actions found in this scope.');
      else actions.forEach((item,index)=>lines.push(
        String(index+1)+'. **'+item.title+'**'
        +(item.processName?' · '+item.processName:'')
        +(item.updatedAt?' · '+item.updatedAt.slice(0,10):''),
      ));
    }
    if(focus!=='actions') {
      lines.push(turkish?'**Son güncellenen notlar**':'**Recently updated Notes**');
      if(!notes.length)lines.push(turkish
        ?'Taranan erişilebilir Action kayıtlarında yakın tarihli Note bulunamadı.'
        :'No recent Notes were found among the accessible Actions scanned.');
      else notes.forEach((note,index)=>lines.push(
        String(index+1)+'. **'+(note.title||'Untitled Note')+'**'
        +(note.actionTitle?' · '+note.actionTitle:'')
        +(note.updatedAt?' · '+note.updatedAt.slice(0,10):'')
        +(note.preview?'\n   '+note.preview:''),
      ));
    }
    lines.push(turkish
      ?'Bunlar **son güncellenen kayıtlar**; tüm güncellemeleri sizin yaptığınızı veya işlerin tamamlandığını varsaymıyorum.'
      :'These are **recently updated records**, not proof you personally changed or completed them.');
    if(data.partialScan===true)lines.push(turkish
      ?'**Not:** Tarama sınırlı; bu liste tüm geçmişi kapsamaz.'
      :'**Note:** The scan is bounded and not an exhaustive history.');
    return lines.join('\n\n');
  }
  if(execution.name==='list_processes') {
    const processes=Array.isArray(data.processes)?data.processes as Array<{name:string}>:[];
    if(!processes.length)return turkish
      ?'Bu kapsamda erişilebilir Process bulunamadı.'
      :'No accessible Processes found in this scope.';
    return [
      turkish?'Erişiminiz olan Process’ler:':'Here are the Processes you can access:',
      ...processes.map((item,index)=>String(index+1)+'. '+item.name),
      ...(data.hasMore===true?[turkish?'Liste kısmi.':'The list is partial.']:[]),
    ].join('\n');
  }
  return null;
}
