/** A single, bounded result contract shared by the authenticated API and Cmd-K UI. */
export type SearchKind='action'|'process'|'note'|'checklist'|'customer'|'team';
export interface GlobalSearchResult {
  id:string;
  kind:SearchKind;
  title:string;
  subtitle:string;
  teamId:string|null;
  projectId:string|null;
  taskId:string|null;
  /** No raw note contents or metadata beyond what is needed to display a result. */
  noteId?:string;
  checklistId?:string;
  score:number;
}
type Row=Record<string,unknown>;
export type SearchData={
  projects:Row[];tasks:Row[];notes:Row[];teams:Row[];customers:Row[];
};
export type SearchScope={teamIds:ReadonlySet<string>;projectIds:ReadonlySet<string>;organizationId:string};

function str(v:unknown):string {return typeof v==='string'?v:'';}
export function normalizeSearchText(value:string):string {
  return value.normalize('NFKD').toLowerCase()
    .replace(/ı/g,'i').replace(/æ/g,'ae').replace(/ß/g,'ss')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}
function safeSnippet(value:string,q:string):string {
  const flat=value.replace(/\s+/g,' ').trim();
  if(!flat)return '';
  const i=normalizeSearchText(flat).indexOf(normalizeSearchText(q));
  const start=i>45?i-42:0;
  return (start?'…':'')+flat.slice(start,start+145)+(flat.length>start+145?'…':'');
}
function scoreFor(title:string,subtitle:string,query:string):number {
  const needle=normalizeSearchText(query);
  const words=needle.split(' ').filter(Boolean);
  if(!words.length)return 0;
  const heading=normalizeSearchText(title);
  const detail=normalizeSearchText(subtitle);
  if(!words.every(w=>heading.includes(w)||detail.includes(w)))return 0;
  if(heading===needle)return 210;
  if(heading.startsWith(needle))return 160;
  if(heading.includes(needle))return 125;
  if(words.every(w=>heading.includes(w)))return 95;
  if(detail.includes(needle))return 65;
  return 42;
}
function richText(value:unknown,max=18000):string {
  const parts:string[]=[];
  let total=0;
  function visit(node:unknown,depth:number) {
    if(total>=max||depth>32||node===null||typeof node!=='object')return;
    if(Array.isArray(node)){for(const child of node)visit(child,depth+1);return;}
    const n=node as Row;
    if(typeof n.text==='string') {
      const content=n.text.slice(0,max-total);
      parts.push(content);
      total+=content.length;
    }
    if(Array.isArray(n.content))visit(n.content,depth+1);
  }
  visit(value,0);
  return parts.join(' ').replace(/\s+/g,' ').trim();
}
function checklistItems(value:unknown):Array<{id:string|null;text:string}> {
  const results:Array<{id:string|null;text:string}>=[];
  let visited=0;
  function visit(node:unknown,depth:number){
    if(++visited>2200||depth>32||!node||typeof node!=='object')return;
    if(Array.isArray(node)){for(const child of node)visit(child,depth+1);return;}
    const n=node as Row;
    if(n.type==='taskItem'){
      const text=richText({content:n.content},500);
      if(text)results.push({
        id:typeof (n.attrs as Row|undefined)?.id==='string'?String((n.attrs as Row).id):null,
        text
      });
      return; // nested taskItems are not indexed twice
    }
    if(Array.isArray(n.content))visit(n.content,depth+1);
  }
  visit(value,0);return results.slice(0,100);
}

export function searchAuthorizedRows(
  data:SearchData,scope:SearchScope,query:string,max=45
):GlobalSearchResult[]{
  const needle=query.trim().slice(0,100);
  if(needle.length<2||max<1)return [];
  const results:GlobalSearchResult[]=[];
  const add=(kind:SearchKind,id:string,title:string,subtitle:string,teamId:string|null,
    projectId:string|null,taskId:string|null,extra?:{noteId?:string;checklistId?:string})=>{
    if(!id||!title)return;
    const score=scoreFor(title,subtitle,needle);
    if(score===0)return;
    results.push({kind,id,title:title.slice(0,170),subtitle:safeSnippet(subtitle,needle),
      teamId,projectId,taskId,score,...extra});
  };
  const visibleTasks=new Map<string,Row>();
  for(const task of data.tasks){
    if(str(task.organization_id)!==scope.organizationId)continue;
    const teamId=str(task.team_id);
    if(!scope.teamIds.has(teamId))continue;
    const processId=str(task.project_id)||null;
    if(processId&&!scope.projectIds.has(processId))continue;
    visibleTasks.set(str(task.id),task);
    add('action',str(task.id),str(task.title),str(task.description),teamId,processId,str(task.id));
    for(const checklist of checklistItems(task.checklist_blocks)){
      add('checklist',checklist.id||str(task.id)+':checklist:'+checklist.text.slice(0,35),
        checklist.text,str(task.title),teamId,processId,str(task.id),
        checklist.id?{checklistId:checklist.id}:undefined);
    }
  }
  for(const note of data.notes){
    if(str(note.organization_id)!==scope.organizationId)continue;
    const teamId=str(note.team_id);
    if(!scope.teamIds.has(teamId))continue;
    const task=visibleTasks.get(str(note.task_id));
    if(!task||str(task.team_id)!==teamId)continue;
    const projectId=str(task.project_id)||null;
    const body=richText(note.content);
    add('note',str(note.id),str(note.title)||'Untitled note',
      body,teamId,projectId,str(note.task_id),{noteId:str(note.id)});
    // A query can match a note body even when the title does not.
  }
  for(const p of data.projects){
    if(str(p.organization_id)!==scope.organizationId)continue;
    const id=str(p.id);if(!scope.projectIds.has(id))continue;
    const teamId=str(p.team_id)||null;
    if(teamId&&!scope.teamIds.has(teamId))continue;
    add('process',id,str(p.name),'Process',teamId,id,null);
  }
  for(const team of data.teams){
    if(str(team.organization_id)!==scope.organizationId||!scope.teamIds.has(str(team.id)))continue;
    add('team',str(team.id),str(team.name),'Team workspace',str(team.id),null,null);
  }
  for(const customer of data.customers){
    if(str(customer.organization_id)!==scope.organizationId)continue;
    add('customer',str(customer.id),str(customer.name),
      str(customer.email),null,null,null);
  }
  return results.sort((a,b)=>b.score-a.score||
    a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title)).slice(0,Math.min(max,60));
}
