// Contract tests for authorization boundaries (no production DB or secrets).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path:string)=>readFileSync(path,'utf8');
const teams=read('app/api/teams/route.ts');
const role=read('lib/team-role-mutations.ts');
const roleEndpoint=read('app/api/teams/[id]/members/[memberId]/role/route.ts');
const member=read('app/api/teams/[id]/members/[memberId]/route.ts');
const move=read('app/api/teams/[id]/members/[memberId]/move/route.ts');
const invite=read('app/api/invitations/route.ts');
const revoke=read('app/api/invitations/[token]/route.ts');
const join=read('app/api/onboarding/join-organization/route.ts');
const add=read('app/api/teams/[id]/members/route.ts');
const cases:Record<string,boolean>={
 'auth GET/POST':(teams.match(/requireAuthedUser\(request\)/g)??[]).length===2,
 'no body organization selection':!teams.includes('body.organizationId')&&!teams.includes('body.createdBy'),
 'org scoped read':teams.includes('requestedOrgId !== actor.organization_id'),
 'user scoped read':teams.includes('targetUserId !== actor.id')&&teams.includes('target.organization_id !== actor.organization_id'),
 'tenant filter':teams.includes("team?.organization_id ?? ''"),
 'session-scoped create':teams.includes('organization_id: actor.organization_id')&&teams.includes('created_by: actor.id'),
 'role helper shared':roleEndpoint.includes('updateTeamMemberRole')&&member.includes('updateTeamMemberRole'),
 'role same-org guard':role.includes('target.organization_id !== access.team.organization_id'),
 'role membership guard':role.includes('getMembership(teamId, memberId)'),
 'role only team scope':!role.includes('userDb.update('),
 'role final team admin':role.includes('Cannot downgrade the last team admin'),
 'member delete does not evict owner':member.includes("user.role === 'owner'"),
 'member delete scoped':member.includes('user.organization_id !== access.team.organization_id'),
 'move role retained':move.includes('movingMembership.role'),
 'move final admin':move.includes('Cannot move the last team admin'),
 'invites scoped':invite.includes('targetTeam.organization_id !== user.organization_id'),
 'invite role checked':invite.includes('Invalid invitation role'),
 'invite revocation requires login':revoke.includes('requireOrgAdmin(request)'),
 'invite revocation scopes org':revoke.includes('invitation.organization_id !== authed.user.organization_id'),
 'join email proof':join.includes('acceptInvitationAtomic(')&&read('lib/invitation-acceptance.ts').includes('INVITE_EMAIL_MISMATCH'),
 'join team proof':read('supabase/migrations/20261108160000_actiproc_entitlement_invite_atomicity.sql').includes('ACTIPROC_INVITE_TEAM_INVALID'),
 'join org role normalized':read('supabase/migrations/20261108160000_actiproc_entitlement_invite_atomicity.sql').includes("'admin'::public.user_role"),
 'direct member role validated':add.includes('Invalid team role'),
};
for(const [name,ok] of Object.entries(cases))assert.ok(ok,'FAILED: '+name);
console.log('Tenant isolation/RBAC: '+Object.keys(cases).length+' source contracts passed.');
