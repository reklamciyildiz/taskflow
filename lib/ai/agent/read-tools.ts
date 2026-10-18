import 'server-only';
import { z } from 'zod';
import { projectDb } from '@/lib/db';
import { retrieveKnowledge } from '@/lib/ai/retrieval/retrieval-server';
import { getPlannerTodayProjection,getPlannerUpcomingProjection } from '@/lib/planner-retrieval-server';
import { getUserSchedulingTimeZone } from '@/lib/scheduling-runtime-server';
import { addCalendarDays } from '@/lib/scheduling-domain';
import { extractChecklistItemsFromTipTap } from '@/lib/tiptap-parser';
import { isTerminalBoardColumn,parseColumnConfigFromJson } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { AIReadReference,AIReadToolActor,AIReadToolExecution,AIReadToolName } from './types';

const uuid=z.string().uuid();
const processSelector=z.object({ processId:uuid.optional(),processName:z.string().trim().min(1).max(120).optional() }).strict()
  .refine((value)=>Boolean(value.processId||value.processName),'processId or processName is required');
const listProcessesSchema=z.object({ teamId:uuid.optional(),query:z.string().trim().max(120).optional(),limit:z.number().int().min(1).max(50).default(25) }).strict();
const processOverviewSchema=processSelector;
const listActionsSchema=z.object({
  teamId:uuid.optional(),processId:uuid.optional(),processName:z.string().trim().min(1).max(120).optional(),
  query:z.string().trim().max(160).optional(),completion:z.enum(['all','completed','incomplete']).default('all'),
  stageIds:z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  priorities:z.array(z.enum(['low','medium','high','urgent'])).max(4).optional(),
  assignedToMe:z.boolean().default(false),assigneeId:uuid.nullable().optional(),
  scheduleDateFrom:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),scheduleDateTo:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit:z.number().int().min(1).max(50).default(20),offset:z.number().int().min(0).max(500).default(0),
}).strict();
const actionDetailsSchema=z.object({ actionId:uuid }).strict();
const plannerSchema=z.object({
  range:z.enum(['today','tomorrow','this_week','custom']).default('today'),teamId:uuid.optional(),
  startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeCompleted:z.boolean().default(true),limit:z.number().int().min(1).max(100).default(50),
}).strict();
const knowledgeSchema=z.object({
  query:z.string().trim().min(1).max(1_000),teamId:uuid.optional(),processId:uuid.optional(),
  processName:z.string().trim().min(1).max(120).optional(),limit:z.number().int().min(1).max(8).default(4),
}).strict();

const schemas:Record<AIReadToolName,z.ZodTypeAny>={
  list_processes:listProcessesSchema,get_process_overview:processOverviewSchema,list_actions:listActionsSchema,
  get_action_details:actionDetailsSchema,get_planner_overview:plannerSchema,search_knowledge:knowledgeSchema,
};

export class AIReadToolError extends Error {
  constructor(readonly code:'invalid_arguments'|'not_found'|'forbidden'|'unavailable',message:string) { super(message);this.name='AIReadToolError'; }
}

const isAdmin=(actor:AIReadToolActor)=>actor.role==='admin'||actor.role==='owner';
const compact=(value:unknown,max=600)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);

async function accessibleTeamIds(actor:AIReadToolActor):Promise<Set<string>> {
  const { data:teams,error:teamError }=await supabaseAdmin.from('teams').select('id').eq('organization_id',actor.organizationId);
  if (teamError) throw new AIReadToolError('unavailable','Team access is temporarily unavailable');
  const organizationTeams=new Set((teams??[]).map((row:any)=>String(row.id)));
  if (isAdmin(actor)) return organizationTeams;
  const { data:memberships,error }=await supabaseAdmin.from('team_members').select('team_id').eq('user_id',actor.userId);
  if (error) throw new AIReadToolError('unavailable','Team access is temporarily unavailable');
  return new Set((memberships??[]).map((row:any)=>String(row.team_id)).filter((id)=>organizationTeams.has(id)));
}

async function visibleProcesses(actor:AIReadToolActor,teamId?:string) {
  const teams=await accessibleTeamIds(actor);
  if (teamId&&!teams.has(teamId)) return [];
  const projects=await projectDb.getVisibleForUser({ organizationId:actor.organizationId,teamId:teamId??null,userId:actor.userId });
  return (projects??[]).filter((project:any)=>!project.team_id||teams.has(String(project.team_id)));
}

async function resolveProcess(actor:AIReadToolActor,input:{processId?:string;processName?:string},teamId?:string) {
  const projects=await visibleProcesses(actor,teamId);
  if (input.processId) return projects.find((project:any)=>String(project.id)===input.processId)??null;
  const query=input.processName?.toLocaleLowerCase('tr-TR').trim()??'';
  return projects.find((project:any)=>String(project.name).toLocaleLowerCase('tr-TR')===query)
    ??projects.find((project:any)=>String(project.name).toLocaleLowerCase('tr-TR').includes(query))??null;
}

function processReference(project:any):AIReadReference {
  return { type:'process',id:String(project.id),title:String(project.name),processId:String(project.id) };
}
function actionReference(task:any,processId?:string|null):AIReadReference {
  return { type:'action',id:String(task.id),title:String(task.title),actionId:String(task.id),processId:processId??null };
}
function localCalendarDate(timeZone:string) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=(type:string)=>parts.find((part)=>part.type===type)?.value??'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function runListProcesses(actor:AIReadToolActor,input:z.infer<typeof listProcessesSchema>):Promise<AIReadToolExecution> {
  let projects=await visibleProcesses(actor,input.teamId);
  if (input.query) { const q=input.query.toLocaleLowerCase('tr-TR');projects=projects.filter((p:any)=>String(p.name).toLocaleLowerCase('tr-TR').includes(q)); }
  const selected=projects.slice(0,input.limit);
  return { name:'list_processes',statusLabel:'Süreçler kontrol ediliyor…',citations:[],references:selected.map(processReference),data:{ total:projects.length,hasMore:projects.length>selected.length,processes:selected.map((p:any)=>({ id:String(p.id),name:String(p.name),teamId:p.team_id?String(p.team_id):null,visibility:String(p.visibility??'team'),stageCount:parseColumnConfigFromJson(p.column_config).length })) } };
}

async function runProcessOverview(actor:AIReadToolActor,input:z.infer<typeof processOverviewSchema>):Promise<AIReadToolExecution> {
  const project=await resolveProcess(actor,input);
  if (!project) throw new AIReadToolError('not_found','Process was not found or is not accessible');
  const { data,error }=await supabaseAdmin.from('tasks').select('id,title,status,priority,checklist_blocks,updated_at')
    .eq('organization_id',actor.organizationId).eq('project_id',project.id).limit(500);
  if (error) throw new AIReadToolError('unavailable','Process overview is temporarily unavailable');
  const columns=parseColumnConfigFromJson(project.column_config);const stageById=new Map(columns.map((stage)=>[stage.id,stage]));
  const stages=new Map<string,{id:string;label:string;isTerminal:boolean;actionCount:number}>();let completedActions=0,checklistTotal=0,checklistCompleted=0;
  for (const task of data??[]) { const stage=stageById.get(String(task.status));const terminal=isTerminalBoardColumn(String(task.status),columns);if(terminal)completedActions++;
    const current=stages.get(String(task.status))??{id:String(task.status),label:stage?.title??String(task.status),isTerminal:terminal,actionCount:0};current.actionCount++;stages.set(current.id,current);
    for(const item of extractChecklistItemsFromTipTap(task.checklist_blocks)){checklistTotal++;if(item.checked)checklistCompleted++;}
  }
  return { name:'get_process_overview',statusLabel:'Süreç özeti hazırlanıyor…',citations:[],references:[processReference(project),...(data??[]).slice(0,25).map((task:any)=>actionReference(task,String(project.id)))],data:{ process:{id:String(project.id),name:String(project.name),visibility:String(project.visibility??'team')},actions:{total:(data??[]).length,completed:completedActions,incomplete:(data??[]).length-completedActions},checklist:{total:checklistTotal,completed:checklistCompleted,incomplete:checklistTotal-checklistCompleted},stages:[...stages.values()] } };
}

async function runListActions(actor:AIReadToolActor,input:z.infer<typeof listActionsSchema>):Promise<AIReadToolExecution> {
  if(input.scheduleDateFrom&&input.scheduleDateTo&&input.scheduleDateFrom>input.scheduleDateTo) throw new AIReadToolError('invalid_arguments','Invalid schedule date range');
  const teams=await accessibleTeamIds(actor);if(input.teamId&&!teams.has(input.teamId)) return {name:'list_actions',statusLabel:'Action’lar kontrol ediliyor…',citations:[],references:[],data:{total:0,hasMore:false,actions:[]}};
  const projects=await visibleProcesses(actor,input.teamId);const projectById=new Map(projects.map((p:any)=>[String(p.id),p]));
  let selectedProject:any=null;if(input.processId||input.processName){selectedProject=await resolveProcess(actor,input,input.teamId);if(!selectedProject)return{name:'list_actions',statusLabel:'Action’lar kontrol ediliyor…',citations:[],references:[],data:{total:0,hasMore:false,actions:[]}};}
  let query=supabaseAdmin.from('tasks').select('id,title,description,status,priority,assignee_id,project_id,team_id,checklist_blocks,updated_at')
    .eq('organization_id',actor.organizationId).limit(501);
  if(input.teamId) query=query.eq('team_id',input.teamId);else if(teams.size) query=query.in('team_id',[...teams]);else return{name:'list_actions',statusLabel:'Action’lar kontrol ediliyor…',citations:[],references:[],data:{total:0,hasMore:false,actions:[]}};
  if(selectedProject) query=query.eq('project_id',selectedProject.id);if(input.priorities?.length)query=query.in('priority',input.priorities);if(input.stageIds?.length)query=query.in('status',input.stageIds);
  if(input.assignedToMe)query=query.eq('assignee_id',actor.userId);else if(input.assigneeId===null)query=query.is('assignee_id',null);else if(input.assigneeId)query=query.eq('assignee_id',input.assigneeId);
  const {data,error}=await query.order('updated_at',{ascending:false});if(error)throw new AIReadToolError('unavailable','Actions are temporarily unavailable');
  let tasks=(data??[]).filter((task:any)=>{const pid=task.project_id?String(task.project_id):null;return pid?projectById.has(pid):teams.has(String(task.team_id));});
  if(input.query){const q=input.query.toLocaleLowerCase('tr-TR');tasks=tasks.filter((t:any)=>`${t.title} ${t.description??''}`.toLocaleLowerCase('tr-TR').includes(q));}
  tasks=tasks.filter((task:any)=>{const project=task.project_id?projectById.get(String(task.project_id)):null;const columns=project?parseColumnConfigFromJson(project.column_config):[];const completed=isTerminalBoardColumn(String(task.status),columns);return input.completion==='all'||(input.completion==='completed'?completed:!completed);});
  const taskIds=tasks.map((t:any)=>String(t.id));const {data:schedules,error:scheduleError}=taskIds.length?await supabaseAdmin.from('work_schedules').select('task_id,schedule_type,schedule_date,schedule_time,time_zone').in('task_id',taskIds).is('checklist_item_id',null).is('archived_at',null):{data:[],error:null};
  if(scheduleError)throw new AIReadToolError('unavailable','Action schedules are temporarily unavailable');const scheduleByTask=new Map((schedules??[]).map((s:any)=>[String(s.task_id),s]));
  if(input.scheduleDateFrom||input.scheduleDateTo)tasks=tasks.filter((t:any)=>{const s:any=scheduleByTask.get(String(t.id));return s&&(!input.scheduleDateFrom||String(s.schedule_date)>=input.scheduleDateFrom)&&(!input.scheduleDateTo||String(s.schedule_date)<=input.scheduleDateTo);});
  const page=tasks.slice(input.offset,input.offset+input.limit);const actions=page.map((task:any)=>{const project:any=task.project_id?projectById.get(String(task.project_id)):null;const columns=project?parseColumnConfigFromJson(project.column_config):[];const stage=columns.find((c)=>c.id===String(task.status));const checklist=extractChecklistItemsFromTipTap(task.checklist_blocks);const schedule:any=scheduleByTask.get(String(task.id));return{id:String(task.id),title:String(task.title),description:compact(task.description,300),priority:String(task.priority),stageId:String(task.status),stageLabel:stage?.title??String(task.status),completed:isTerminalBoardColumn(String(task.status),columns),assigneeId:task.assignee_id?String(task.assignee_id):null,processId:project?String(project.id):null,processName:project?String(project.name):null,checklist:{total:checklist.length,completed:checklist.filter((i)=>i.checked).length},schedule:schedule?{type:String(schedule.schedule_type),date:String(schedule.schedule_date),time:schedule.schedule_time?String(schedule.schedule_time):null,timeZone:schedule.time_zone?String(schedule.time_zone):null}:null,updatedAt:String(task.updated_at)}});
  return{name:'list_actions',statusLabel:'Action’lar kontrol ediliyor…',citations:[],references:page.map((t:any)=>actionReference(t,t.project_id?String(t.project_id):null)),data:{total:tasks.length,hasMore:input.offset+page.length<tasks.length,actions}};
}

async function runActionDetails(actor:AIReadToolActor,input:z.infer<typeof actionDetailsSchema>):Promise<AIReadToolExecution>{
  const {data:task,error}=await supabaseAdmin.from('tasks').select('id,title,description,status,priority,assignee_id,project_id,team_id,organization_id,checklist_blocks,updated_at').eq('id',input.actionId).eq('organization_id',actor.organizationId).maybeSingle();
  if(error)throw new AIReadToolError('unavailable','Action details are temporarily unavailable');if(!task)throw new AIReadToolError('not_found','Action was not found or is not accessible');
  const teams=await accessibleTeamIds(actor);if(!teams.has(String(task.team_id)))throw new AIReadToolError('not_found','Action was not found or is not accessible');
  const projects=await visibleProcesses(actor,String(task.team_id));const project:any=task.project_id?projects.find((p:any)=>String(p.id)===String(task.project_id)):null;if(task.project_id&&!project)throw new AIReadToolError('not_found','Action was not found or is not accessible');
  const columns=project?parseColumnConfigFromJson(project.column_config):[];const stage=columns.find((c)=>c.id===String(task.status));const checklist=extractChecklistItemsFromTipTap(task.checklist_blocks);
  const refs:AIReadReference[]=[actionReference(task,project?String(project.id):null),...checklist.slice(0,50).map((item)=>({type:'checklist' as const,id:item.id,title:item.text,actionId:String(task.id),processId:project?String(project.id):null,checklistItemId:item.id}))];
  return{name:'get_action_details',statusLabel:'Action ayrıntıları kontrol ediliyor…',citations:[],references:refs,data:{id:String(task.id),title:String(task.title),description:compact(task.description,1_000),priority:String(task.priority),stageId:String(task.status),stageLabel:stage?.title??String(task.status),completed:isTerminalBoardColumn(String(task.status),columns),assigneeId:task.assignee_id?String(task.assignee_id):null,process:project?{id:String(project.id),name:String(project.name)}:null,checklist:checklist.map((item)=>({id:item.id,text:item.text,checked:item.checked,assigneeId:item.assigneeId,dueDate:item.dueDate,completedAt:item.completedAt})),updatedAt:String(task.updated_at)}};
}

async function runPlanner(actor:AIReadToolActor,input:z.infer<typeof plannerSchema>):Promise<AIReadToolExecution>{
  if(input.teamId){const teams=await accessibleTeamIds(actor);if(!teams.has(input.teamId))throw new AIReadToolError('forbidden','Planner scope is not accessible');}
  const timeZone=await getUserSchedulingTimeZone(actor.userId);const today=localCalendarDate(timeZone);let start=today,end=today;
  if(input.range==='tomorrow'){start=addCalendarDays(today,1);end=start;}else if(input.range==='this_week'){const weekday=new Date(`${today}T12:00:00Z`).getUTCDay();const mondayOffset=(weekday+6)%7;start=addCalendarDays(today,-mondayOffset);end=addCalendarDays(start,6);}else if(input.range==='custom'){if(!input.startDate||!input.endDate||input.startDate>input.endDate)throw new AIReadToolError('invalid_arguments','A valid custom date range is required');start=input.startDate;end=input.endDate;}
  const days=Math.round((Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86_400_000)+1;if(days<1||days>31)throw new AIReadToolError('invalid_arguments','Planner range must be between 1 and 31 days');
  const actorInput={userId:actor.userId,organizationId:actor.organizationId,role:actor.role};let items:any[]=[];
  if(input.range==='today'){const projection=await getPlannerTodayProjection(actorInput,today,{teamId:input.teamId,timeZone});items=[...projection.overdue,...projection.today,...(input.includeCompleted?projection.completedToday:[])];}
  else{const projection=await getPlannerUpcomingProjection(actorInput,start,days,{teamId:input.teamId});items=projection.groups.flatMap((group)=>group.items).filter((item)=>input.includeCompleted||item.state!=='completed');}
  const selected=items.slice(0,input.limit);return{name:'get_planner_overview',statusLabel:'Planner kontrol ediliyor…',citations:[],references:selected.map((item)=>actionReference({id:item.taskId,title:item.taskTitle},item.projectId)),data:{range:{startDate:start,endDate:end,timeZone},total:items.length,hasMore:items.length>selected.length,items:selected.map((item)=>({date:item.effectiveDate,time:item.scheduleTime,state:item.state,isRecurring:item.isRecurring,actionId:item.taskId,actionTitle:item.taskTitle,checklistItemId:item.checklistItemId,checklistItemText:item.checklistItemText,processId:item.projectId,processName:item.projectName,missedCount:item.missedCount}))}};
}

async function runKnowledge(actor:AIReadToolActor,input:z.infer<typeof knowledgeSchema>):Promise<AIReadToolExecution>{
  let processId=input.processId;
  if(processId||input.processName){const process=await resolveProcess(actor,{processId,processName:input.processName},input.teamId);if(!process)return{name:'search_knowledge',statusLabel:'Bilgi kaynakları aranıyor…',citations:[],references:[],data:{executedMode:'none',resultCount:0,sources:[]}};processId=String(process.id);}
  const result=await retrieveKnowledge({query:input.query,mode:'hybrid',limit:input.limit,teamId:input.teamId,processId,timeoutMs:15_000});
  return{name:'search_knowledge',statusLabel:'Bilgi kaynakları aranıyor…',citations:result.citations,references:result.citations.map((citation)=>citation.actionId?{type:'action' as const,id:citation.actionId,title:citation.title,actionId:citation.actionId,processId:citation.processId}:{type:'process' as const,id:citation.processId??citation.sourceId,title:citation.title,processId:citation.processId}),data:{executedMode:result.executedMode,resultCount:result.citations.length,sources:result.citations.map((citation)=>({citationId:citation.citationId,title:citation.title,type:citation.sourceType,processName:citation.process?.name??null,snippet:compact(citation.snippet,700)}))}};
}

export async function executeAIReadTool(name:string,rawArguments:unknown,actor:AIReadToolActor):Promise<AIReadToolExecution>{
  if(!(name in schemas))throw new AIReadToolError('invalid_arguments','Unknown read tool');const tool=name as AIReadToolName;const parsed=schemas[tool].safeParse(rawArguments);
  if(!parsed.success)throw new AIReadToolError('invalid_arguments',`Invalid arguments for ${tool}`);
  if(tool==='list_processes')return runListProcesses(actor,parsed.data);
  if(tool==='get_process_overview')return runProcessOverview(actor,parsed.data);
  if(tool==='list_actions')return runListActions(actor,parsed.data);
  if(tool==='get_action_details')return runActionDetails(actor,parsed.data);
  if(tool==='get_planner_overview')return runPlanner(actor,parsed.data);
  return runKnowledge(actor,parsed.data);
}
