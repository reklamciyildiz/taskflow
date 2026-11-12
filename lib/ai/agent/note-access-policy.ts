/** Pure authorization predicate shared by the canonical Notes reader and tests.
 * Note read permission mirrors the Action Note API: the note must belong to an
 * authorized Team, its current parent Action, and a visible Process.
 * Neither authorship nor organization admin status bypasses Process visibility.
 */
export type NoteAccessTask = {id:string;team_id:string|null;project_id:string|null;title:string|null};
export type NoteAccessProject = {id:string;team_id:string|null};

export function canReadCanonicalNote(
  note:{task_id:string;team_id:string},
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
