import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { previewTextFromTipTap } from '@/lib/tiptap-parser';
import { normalizeAIEntityName } from './entity-matching';

/**
 * Primary source is notes, not a truncated list of recently modified Actions.
 * Limit all DB scans, validate parent Action and project visibility before
 * anything is returned to an LLM, and disclose scans that cannot be exhaustive.
 */
export type CanonicalNoteSort = 'created_desc' | 'updated_desc';
export type CanonicalNoteAuthorScope = 'mine' | 'accessible';
export type NoteAccessTask = {id:string;team_id:string|null;project_id:string|null;title:string|null};
export type NoteAccessProject = {id:string;team_id:string|null};
export type CanonicalNoteRow = {
  id:string;task_id:string;team_id:string;author_id:string;
  title:string|null;type:string;content:unknown;created_at:string;updated_at:string;
};

export function canReadCanonicalNote(
  note:Pick<CanonicalNoteRow,'task_id'|'team_id'>,
  task:NoteAccessTask|undefined,
  allowedTeams:ReadonlySet<string>,
  visibleProjects:ReadonlyMap<string,NoteAccessProject>,
  requestedProjectId?:string,
):boolean {
  if(!task||task.id!==note.task_id||!note.team_id||note.team_id!==task.team_id
    ||!allowedTeams.has(note.team_id))return false;
  if(requestedProjectId && task.project_id!==requestedProjectId)return false;
  if(!task.project_id)return requestedProjectId===undefined;
  const project=visibleProjects.get(task.project_id);
  return Boolean(project && (!project.team_id || project.team_id===task.team_id));
}

export type CanonicalNoteSnapshot = {
  notes:Array<{
    id:string;title:string;type:string;
    authorId:string;actionId:string;actionTitle:string;
    processId:string|null;processName:string|null;
    createdAt:string;updatedAt:string;preview:string;
  }>;
  partialScan:boolean;
  scanned:number;
  hasMore:boolean;
};

/**
 * This is a bounded per-Team scan. For a latest-note request, only the first
 * authorized matching page for each Team chunk is needed; search requests
 * scan additional pages to find sparse matches, but never claim completeness
 * when the scan cap was reached.
 */
export async function listCanonicalAuthorizedNotes(input:{
  actor:{userId:string;organizationId:string};
  allowedTeams:ReadonlySet<string>;
  visibleProjects:ReadonlyMap<string,NoteAccessProject & {name?:string|null}>;
  teamId?:string;
  processId?:string;
  authorScope:CanonicalNoteAuthorScope;
  sort:CanonicalNoteSort;
  query?:string;
  limit:number;
}):Promise<CanonicalNoteSnapshot> {
  const teamIds=input.teamId?[input.teamId]:Array.from(input.allowedTeams);
  if(!teamIds.length)return {notes:[],partialScan:false,scanned:0,hasMore:false};
  const sortField=input.sort==='created_desc'?'created_at':'updated_at';
  const query=input.query?.trim()?normalizeAIEntityName(input.query):null;
  const matches:Array<CanonicalNoteSnapshot['notes'][number]>=[];
  const projectById=input.visibleProjects;
  let scanned=0,partialScan=false,hasMore=false;
  const SCAN_CAP=1200;
  const GROUP_LIMIT=75;
  const PAGE_SIZE=80;
  const PER_GROUP_CAP=480;
  for(let t=0;t<teamIds.length;t+=GROUP_LIMIT){
    const group=teamIds.slice(t,t+GROUP_LIMIT);
    let offset=0,groupScanned=0;
    while(scanned<SCAN_CAP&&groupScanned<PER_GROUP_CAP){
      const pageSize=Math.min(PAGE_SIZE,SCAN_CAP-scanned,PER_GROUP_CAP-groupScanned);
      if(!pageSize)break;
      let request=supabaseAdmin.from('notes')
        .select('id,task_id,team_id,author_id,title,type,content,created_at,updated_at',{count:'exact'})
        .eq('organization_id',input.actor.organizationId)
        .in('team_id',group);
      if(input.authorScope==='mine')request=request.eq('author_id',input.actor.userId);
      const {data,error,count}=await request.order(sortField,{ascending:false})
        .order('id',{ascending:true}).range(offset,offset+pageSize-1);
      if(error)throw new Error('Canonical notes query failed');
      const rows=(data??[]) as CanonicalNoteRow[];
      offset+=rows.length;groupScanned+=rows.length;scanned+=rows.length;
      if(!rows.length)break;
      const taskIds=[...new Set(rows.map(row=>row.task_id))];
      const {data:taskRows,error:taskError}=await supabaseAdmin.from('tasks')
        .select('id,team_id,project_id,title').eq('organization_id',input.actor.organizationId)
        .in('id',taskIds);
      if(taskError)throw new Error('Canonical note parent authorization failed');
      const tasks=new Map<string,NoteAccessTask>((taskRows??[]).map((task:any)=>[String(task.id),{
        id:String(task.id),team_id:task.team_id?String(task.team_id):null,
        project_id:task.project_id?String(task.project_id):null,title:task.title?String(task.title):null,
      }]));
      for(const note of rows){
        const task=tasks.get(note.task_id);
        if(!canReadCanonicalNote(note,task,input.allowedTeams,projectById,input.processId))continue;
        const preview=previewTextFromTipTap(note.content,1000);
        if(query&&!normalizeAIEntityName((note.title??'')+' '+preview).includes(query))continue;
        const project=task?.project_id?projectById.get(task.project_id):null;
        matches.push({
          id:note.id,title:String(note.title??'').slice(0,240),type:String(note.type??'note'),
          authorId:note.author_id,actionId:note.task_id,actionTitle:String(task?.title??'').slice(0,200),
          processId:task?.project_id??null,processName:project?.name??null,
          createdAt:note.created_at,updatedAt:note.updated_at,preview:preview.slice(0,700),
        });
      }
      const more=count===null||offset<count;
      if(more)hasMore=true;
      // For a latest/list query, the remaining rows in this team group are
      // older; they cannot outrank its selected first-page matches.
      if(!query&&matches.length>=input.limit)break;
      if(!more)break;
      if(scanned>=SCAN_CAP||groupScanned>=PER_GROUP_CAP){partialScan=true;break;}
    }
    if(scanned>=SCAN_CAP && t+GROUP_LIMIT<teamIds.length)partialScan=true;
    if(scanned>=SCAN_CAP)break;
  }
  matches.sort((a,b)=>{
    const key=input.sort==='created_desc'?'createdAt':'updatedAt';
    return b[key].localeCompare(a[key])||a.id.localeCompare(b.id);
  });
  return {notes:matches.slice(0,input.limit),partialScan,scanned,
    hasMore:hasMore||matches.length>input.limit||partialScan};
}
