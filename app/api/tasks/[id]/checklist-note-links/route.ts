import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { noteDb } from '@/lib/db';
import { requireTaskNoteAccess } from '@/lib/note-server';
import { checklistItemExists } from '@/lib/checklist-note-links';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ApiResponse } from '@/lib/types';
import type { ChecklistNoteLink } from '@/lib/checklist-note-links';

const linkSchema = z.object({
  noteId: z.string().uuid(),
  checklistItemId: z.string().trim().min(1).max(200),
}).strict();

function failure(message:string,status:number) {
  return NextResponse.json<ApiResponse<null>>({success:false,error:message},{status});
}

type RouteContext={params:{id:string}};

/** All reads are verified against current organization, Team and Process ACLs. */
export async function GET(request:NextRequest,{params}:RouteContext) {
  const access=await requireTaskNoteAccess(params.id,{mutate:false},undefined,request);
  if(access instanceof NextResponse)return access;
  const {data,error}=await supabaseAdmin.from('note_checklist_links')
    .select('note_id,checklist_item_id,created_at')
    .eq('organization_id',String((access.task as any).organization_id))
    .eq('task_id',params.id)
    .order('created_at',{ascending:true}).limit(1000);
  if(error) {
    console.error('Connected Notes lookup failed',error.code);
    return failure('Linked notes are temporarily unavailable',503);
  }
  // The scope is validated before the service-role query. Never return linked
  // Notes from another Action or arbitrary user-supplied organization IDs.
  const links:ChecklistNoteLink[]=(data??[]).map(row=>({
    noteId:String(row.note_id),checklistItemId:String(row.checklist_item_id),
    createdAt:String(row.created_at),
  }));
  return NextResponse.json<ApiResponse<ChecklistNoteLink[]>>({success:true,data:links});
}

/** Both the API and the database trigger enforce same-Action identity. */
export async function POST(request:NextRequest,{params}:RouteContext) {
  const access=await requireTaskNoteAccess(params.id,{mutate:true},undefined,request);
  if(access instanceof NextResponse)return access;
  const parsed=linkSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return failure('Invalid Note or checklist reference',400);
  if(!checklistItemExists((access.task as any).checklist_blocks,parsed.data.checklistItemId))
    return failure('Save this checklist item before linking a Note',409);
  const note=await noteDb.getById(parsed.data.noteId);
  if(!note
    || String((note as any).task_id)!==params.id
    || String((note as any).organization_id)!==String((access.task as any).organization_id)
    || String((note as any).team_id)!==String((access.task as any).team_id))
    return failure('Note was not found in this Action',404);

  const {error}=await supabaseAdmin.from('note_checklist_links').insert({
    task_id:params.id,
    note_id:parsed.data.noteId,
    checklist_item_id:parsed.data.checklistItemId,
    organization_id:String((access.task as any).organization_id),
    team_id:String((access.task as any).team_id),
    created_by:String(access.user.id),
  });
  if(error?.code==='23505')return NextResponse.json({success:true,data:{linked:true}});
  if(error?.code==='23514'||error?.code==='23503')
    return failure('Checklist or Note changed; reload and try again',409);
  if(error) {
    console.error('Connected Notes insert failed',error.code);
    return failure('Could not connect the Note',503);
  }
  return NextResponse.json({success:true,data:{linked:true}},{status:201});
}

export async function DELETE(request:NextRequest,{params}:RouteContext) {
  const access=await requireTaskNoteAccess(params.id,{mutate:true},undefined,request);
  if(access instanceof NextResponse)return access;
  const parsed=linkSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return failure('Invalid Note or checklist reference',400);
  const {error}=await supabaseAdmin.from('note_checklist_links').delete()
    .eq('organization_id',String((access.task as any).organization_id))
    .eq('task_id',params.id).eq('note_id',parsed.data.noteId)
    .eq('checklist_item_id',parsed.data.checklistItemId);
  if(error) {
    console.error('Connected Notes removal failed',error.code);
    return failure('Could not remove the Note connection',503);
  }
  // Unlinking a Note never deletes either Note content or checklist item.
  return NextResponse.json({success:true,data:null});
}
