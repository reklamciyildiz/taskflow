import {NextRequest,NextResponse} from 'next/server';
import {requireAuthedUser,isOrgAdmin} from '@/lib/server-authz';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {projectDb} from '@/lib/db';
import {searchAuthorizedRows,type SearchData} from '@/lib/search/global-search';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const maxTeams=120;
const taskWindow=450;
const noteWindow=320;
const empty={success:true,data:[],partial:false};
const searchBurst=new Map<string,{windowStart:number;count:number}>();
const RATE_WINDOW_MS=10_000;
const RATE_MAX=20;
/** A server-side, ACL-enforced search. No service-role content is returned without validation.
 * All searches are bounded to prevent a single keypress from scanning an unlimited workspace.
 */
export async function GET(request:NextRequest){
  const authed=await requireAuthedUser(request);
  if(authed instanceof NextResponse)return authed;
  const organizationId=String(authed.user.organization_id??'');
  const userId=String(authed.user.id??'');
  if(!organizationId||!userId){
    return NextResponse.json({success:false,error:'Organization required'},{status:403});
  }
  const now=Date.now();
  const active=searchBurst.get(userId);
  const bucket=active&&now-active.windowStart<RATE_WINDOW_MS?{...active,count:active.count+1}:{windowStart:now,count:1};
  searchBurst.set(userId,bucket);
  if(searchBurst.size>2500){for(const [id,entry] of searchBurst){if(now-entry.windowStart>RATE_WINDOW_MS)searchBurst.delete(id);}}
  if(bucket.count>RATE_MAX)return NextResponse.json({success:false,error:'Too many searches. Please try again shortly.'},{status:429,headers:{'Retry-After':'10','Cache-Control':'private, no-store'}});
  const params=new URL(request.url).searchParams;
  const query=(params.get('q')??'').trim();
  const selectedTeamId=params.get('teamId')||null;
  if(query.length<2)return NextResponse.json(empty,{headers:{'Cache-Control':'private, no-store'}});
  if(query.length>100||/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(query)){
    return NextResponse.json({success:false,error:'Search must be 2–100 characters'},{status:400});
  }
  try{
    const {data:orgTeams,error:teamsError}=await supabaseAdmin.from('teams')
      .select('id,name,organization_id').eq('organization_id',organizationId)
      .order('id').limit(maxTeams+1);
    if(teamsError)throw teamsError;
    if((orgTeams??[]).length>maxTeams)
      return NextResponse.json({success:false,error:'Search scope is too large. Contact support.'},{status:422});
    const allTeamIds=(orgTeams??[]).map(t=>String(t.id));
    if(!allTeamIds.length)return NextResponse.json(empty,{headers:{'Cache-Control':'private, no-store'}});
    let authorized=new Set<string>();
    if(isOrgAdmin(authed.user)){
      authorized=new Set(allTeamIds);
    }else{
      const {data:members,error:membershipError}=await supabaseAdmin.from('team_members')
        .select('team_id').eq('user_id',userId).in('team_id',allTeamIds);
      if(membershipError)throw membershipError;
      authorized=new Set((members??[]).map(row=>String(row.team_id)));
    }
    if(selectedTeamId&&!authorized.has(selectedTeamId))
      return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const teamIds=selectedTeamId?[selectedTeamId]:[...authorized];
    if(!teamIds.length)return NextResponse.json(empty,{headers:{'Cache-Control':'private, no-store'}});
    const projects=await projectDb.getVisibleForUser({organizationId,teamId:selectedTeamId,userId});
    const scopedProjects=(projects??[]).filter((p:any)=>!p.team_id||authorized.has(String(p.team_id)));
    const projectIds=new Set(scopedProjects.map((p:any)=>String(p.id)));
    const scopedTeams=(orgTeams??[]).filter(t=>teamIds.includes(String(t.id)));

    const taskFields='id,title,description,checklist_blocks,project_id,team_id,organization_id,updated_at';
    const noteFields='id,title,content,task_id,team_id,organization_id,updated_at';
    const commonTasks=()=>supabaseAdmin.from('tasks').select(taskFields)
      .eq('organization_id',organizationId).in('team_id',teamIds);
    const commonNotes=()=>supabaseAdmin.from('notes').select(noteFields)
      .eq('organization_id',organizationId).in('team_id',teamIds);
    // Escape LIKE special characters; never interpolate raw input into .or() SQL syntax.
    const term='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    const [recentTasks,titleTasks,descriptionTasks,recentNotes,titleNotes,customers]=await Promise.all([
      commonTasks().order('updated_at',{ascending:false}).limit(taskWindow),
      commonTasks().ilike('title',term).order('updated_at',{ascending:false}).limit(130),
      commonTasks().ilike('description',term).order('updated_at',{ascending:false}).limit(100),
      commonNotes().order('updated_at',{ascending:false}).limit(noteWindow),
      commonNotes().ilike('title',term).order('updated_at',{ascending:false}).limit(100),
      supabaseAdmin.from('customers').select('id,name,email,organization_id')
        .eq('organization_id',organizationId).order('name').limit(300),
    ]);
    for(const result of [recentTasks,titleTasks,descriptionTasks,recentNotes,titleNotes,customers]){
      if(result.error)throw result.error;
    }
    const taskById=new Map<string,Record<string,unknown>>();
    const noteById=new Map<string,Record<string,unknown>>();
    const pushRows=(map:Map<string,Record<string,unknown>>,rows:unknown[]|null)=>{
      for(const row of rows??[]){
        if(!row||typeof row!=='object')continue;
        const record=row as Record<string,unknown>;
        const id=String(record.id??'');if(id)map.set(id,record);
      }
    };
    pushRows(taskById,recentTasks.data);
    pushRows(taskById,titleTasks.data);
    pushRows(taskById,descriptionTasks.data);
    pushRows(noteById,recentNotes.data);
    pushRows(noteById,titleNotes.data);

    // Notes have their own limited scan. Fetch canonical parent Action scopes before
    // exposing a note, including parents older than the recent Action window.
    const parentIds=[...new Set([...noteById.values()].map(n=>String(n.task_id??'')))]
      .filter(id=>id&&!taskById.has(id));
    for(let offset=0;offset<parentIds.length;offset+=100){
      const subset=parentIds.slice(offset,offset+100);
      const {data:parents,error}=await supabaseAdmin.from('tasks').select(taskFields)
        .eq('organization_id',organizationId).in('team_id',teamIds).in('id',subset);
      if(error)throw error;
      pushRows(taskById,parents);
    }
    const data:SearchData={
      tasks:[...taskById.values()],
      notes:[...noteById.values()],
      projects:scopedProjects,
      teams:scopedTeams,
      customers:customers.data??[],
    };
    const result=searchAuthorizedRows(data,{
      teamIds:new Set(teamIds),projectIds,organizationId,
    },query,48);
    const partial=[
      [recentTasks.data,taskWindow],[titleTasks.data,130],[descriptionTasks.data,100],
      [recentNotes.data,noteWindow],[titleNotes.data,100],[customers.data,300]
    ].some(([records,limit])=>Array.isArray(records)&&records.length===limit);
    return NextResponse.json({success:true,data:result,partial},{
      headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
    });
  }catch(error){
    // Do not log the query: it can contain a private customer or document name.
    console.error('[global-search] scoped search failed',error instanceof Error?error.name:'unknown');
    return NextResponse.json({success:false,error:'Search is temporarily unavailable'},{
      status:500,headers:{'Cache-Control':'private, no-store'}
    });
  }
}
