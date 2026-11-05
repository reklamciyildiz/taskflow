// Regression contracts for authenticated Process and member-directory access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(file:string)=>readFileSync(file,'utf8');
const routes=read('app/api/projects/route.ts');
const project=read('app/api/projects/[id]/route.ts');
const members=read('app/api/projects/[id]/members/route.ts');
const directory=read('app/api/organizations/[id]/available-members/route.ts');
const contracts:Record<string,boolean>={
  'process listing requires session':routes.includes('requireAuthedUser(request)'),
  'GET organization from signed-in user':routes.includes('const organizationId: string | null = user.organization_id ?? null'),
  'GET client org cannot override':routes.includes('organizationIdParam !== organizationId'),
  'GET team belongs to signed-in organization':routes.includes('scopedTeam.organization_id !== organizationId'),
  'POST uses signed-in org':routes.includes('const organizationId: string = user.organization_id'),
  'POST uses signed-in author':routes.includes('const createdBy: string = user.id'),
  'POST cross-org team blocked':routes.includes("Team is outside this organization"),
  'PATCH and DELETE reject users without an org':
    (project.match(/!user\?\.organization_id \|\| existing\.organization_id !== user\.organization_id/g)??[]).length===2,
  'PATCH prevents cross-org team moves':project.includes('targetTeam.organization_id !== user.organization_id'),
  'PATCH prohibits team admins from making general project':project.includes('Only organization admins can make a Process general'),
  'PATCH requires destination team admin':project.includes('Administrator access to target team required'),
  'project member PUT validates organization':members.includes('userDb.getByOrganization(project.organization_id)'),
  'project member PUT checks IDs before replacing':members.indexOf('userIds.some((id) => !allowedIds.has(id))')<members.indexOf('await projectMemberDb.replaceMembers('),
  'directory requires auth':directory.includes('requireAuthedUser(request)'),
  'directory rejects foreign org':directory.includes('actor.organization_id !== params.id'),
  'directory restricts listing to admins':directory.includes('Only admins may list available organization members'),
  'directory validates excluded team org':directory.includes('team.organization_id !== params.id'),
  'directory never returns raw user rows':!directory.includes('data: organizationUsers') && directory.includes('data: safeUsers'),
};
for(const [name,ok] of Object.entries(contracts))assert.equal(ok,true,'Security contract: '+name);
console.log('Process and directory tenancy: '+Object.keys(contracts).length+' source contracts passed.');
