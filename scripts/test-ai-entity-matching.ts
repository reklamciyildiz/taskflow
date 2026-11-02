import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchAIEntity, normalizeAIEntityName, stageHintFromText } from '../lib/ai/agent/entity-matching';
import { shouldPlanAIWrite } from '../lib/ai/agent/write-selector';

const cols=['To Do','In Progress','In Review','Done'].map((title,id)=>({id,title}));
const match=(q:string,list=cols)=>matchAIEntity(q,list,x=>x.title);
function got(q:string,want:string) {
 const result=match(q);
 assert.equal(result.kind,'match',q+': expected '+want+' but got '+JSON.stringify(result));
 if (result.kind==='match') assert.equal(result.label,want);
}
got('In Progress','In Progress');
got('in proggress','In Progress');
got('İN PRoGRess','In Progress');
got('in progess','In Progress');
got('in pro gress','In Progress');
got('In Review kolonu','In Review');
got('In Progress column','In Progress');
assert.equal(normalizeAIEntityName('İŞLER GÜNCELLEŞTİRİLDİ'),'isler guncellestirildi');
assert.equal(match('in').kind,'none','Short, generic terms must not pick a column');
assert.equal(match('doen').kind,'none','Short labels must not accept risky fuzzy guesses');
assert.equal(match('ProgreZZ').kind,'none','Partial internal word typo is not a safe full target');
assert.equal(match('an unrelated column').kind,'none');

const similar=[...cols,{id:4,title:'In Proggres'}];
const close=match('in proggress',similar);
assert.equal(close.kind,'ambiguous','Near-collision must prompt clarification, not guess');
const duplicated=match('In Progress',[...cols,{id:5,title:'In Progress'}]);
assert.equal(duplicated.kind,'ambiguous');
assert.equal(match('In Progres',[...cols,{id:5,title:'In Progress 2'}]).kind,'ambiguous');

const projects=['ALUMAS','Dönüşüm Süreci','SmartSafe AI'].map((name,id)=>({id,name}));
const proc=(q:string)=>matchAIEntity(q,projects,x=>x.name);
assert.equal(proc('alumass').kind,'match');
assert.equal(proc("Alumas'ta").kind,'match');
assert.equal(proc('Alumas processinde').kind,'match');
assert.equal(proc('donusum sureci').kind,'match');
assert.equal(proc('SmartSafe Aİ process').kind,'match');
assert.equal(proc('Sma').kind,'none');
assert.equal(stageHintFromText('Alumas procesinde in proggress kolonunda test adında aksiyon oluştur'),
 'Alumas procesinde in proggress');
assert.equal(stageHintFromText('test adıyla aksiyon oluştur'),''
 || null); // no target -> default workflow is allowed
assert.equal(stageHintFromText('in proggress sütununa task ekleyelim'),'in proggress');

assert.equal(shouldPlanAIWrite('Alumas processinde in proggress kolonunda test adında aksiyon oluştur'),true);
assert.equal(shouldPlanAIWrite('İn Progress kolonuna yeni aksiyon ekleyelim'),true);
assert.equal(shouldPlanAIWrite('Bu action kartını oluşturalım'),true);
assert.equal(shouldPlanAIWrite('Yeni bir note eklemek istiyorum'),true);
assert.equal(shouldPlanAIWrite('SmartSafe Action açıklamasını değiştir',true),true);
assert.equal(shouldPlanAIWrite('Bu checklist maddesini işaretleyelim'),true);
assert.equal(shouldPlanAIWrite('Kaç action var?'),false);
assert.equal(shouldPlanAIWrite('In Progress neden boş?'),false);

const proposals=fs.readFileSync('lib/ai/agent/write-proposals-server.ts','utf8');
const reads=fs.readFileSync('lib/ai/agent/read-tools.ts','utf8');
const selector=fs.readFileSync('lib/ai/agent/write-selector.ts','utf8');
const route=fs.readFileSync('app/api/ai/chat/route.ts','utf8');
assert.ok(route.includes("error.code==='ambiguous' || error.code==='not_found'") &&
 route.includes("clarificationRequired:true") &&
 route.includes("send({type:'delta',text:answer})"),
 'Ambiguous or missing targets should become an ordinary conversational clarification');
assert.ok(proposals.includes("Process ID ile belirtilen isim eşleşmiyor") &&
 proposals.includes("Action ID ile adı uyuşmuyor") &&
 proposals.includes("Kolon ID ile adı uyuşmuyor") &&
 proposals.includes("Checklist maddesinin ID ve metni uyuşmuyor"),
 'Names and supplied canonical IDs must never silently disagree');
assert.ok(proposals.includes("matchAIEntity(") &&
 proposals.includes("stageHintFromText(") &&
 proposals.includes("resolveNamedTarget(") &&
 proposals.includes("Yazım eşleştirmesi · onaylayın") &&
 proposals.includes("if (input.stageId)") &&
 proposals.includes("throw new AIWriteProposalError('not_found', 'Kolon ID geçerli değil") &&
 !proposals.includes("uniqueMatch("),
 'Writes must resolve typo names inside actor scope and show canonical target on approval');
assert.ok(reads.includes("matchAIEntity(") &&
 !reads.includes('projects.find((project:any)=>String(project.name).toLocaleLowerCase') &&
 reads.includes("if (result.kind==='ambiguous')"),
 'Read-only Process lookup must also avoid a wrong first substring match');
assert.ok(selector.includes('normalizeAIEntityName(input.question)') &&
 selector.includes('Do not silently replace a user-named stage with a default stage'),
 'Model selector must tolerate informal language without inventing a stage');

console.log('PASS: Turkish/English typos, name collisions, stages, intent inflections and approval safeguards');
