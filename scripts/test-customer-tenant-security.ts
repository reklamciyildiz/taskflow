import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  createCustomer, deleteCustomer, isCustomerId, listCustomers, readCustomer, updateCustomer,
  type CustomerActor, type CustomerRecord, type CustomerRepository,
} from '../lib/customer-security';

const orgA = '11111111-1111-4111-8111-111111111111';
const orgB = '22222222-2222-4222-8222-222222222222';
const customerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const customerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownerA: CustomerActor = { id: 'user-owner-a', organization_id: orgA, role: 'owner' };
const adminA: CustomerActor = { id: 'user-admin-a', organization_id: orgA, role: 'admin' };
const memberA: CustomerActor = { id: 'user-member-a', organization_id: orgA, role: 'member' };
const viewerA: CustomerActor = { id: 'user-viewer-a', organization_id: orgA, role: 'viewer' };
const ownerB: CustomerActor = { id: 'user-owner-b', organization_id: orgB, role: 'owner' };

function fixture() {
  const rows = new Map<string, CustomerRecord>([
    [customerA, { id: customerA, organization_id: orgA, name: 'Owned by A', notes: 'A private' }],
    [customerB, { id: customerB, organization_id: orgB, name: 'Owned by B', notes: 'B private' }],
  ]);
  const operations: Array<{ kind: string; id?: string; org?: string }> = [];
  const store: CustomerRepository = {
    async getByOrganization(org) {
      operations.push({kind: 'list',org});
      return [...rows.values()].filter(row => row.organization_id === org);
    },
    async getById(id, org) {
      operations.push({kind: 'get',id,org});
      const row = rows.get(id);
      return row?.organization_id === org ? { ...row } : null;
    },
    async create(fields) {
      operations.push({kind: 'create',org:fields.organization_id});
      const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const row = { ...fields,id };
      rows.set(id,row);
      return { ...row };
    },
    async update(id,org,changes) {
      operations.push({kind:'update',id,org});
      const row = rows.get(id);
      if (!row || row.organization_id !== org) return null;
      const updated = {...row,...changes};
      rows.set(id,updated);
      return {...updated};
    },
    async delete(id,org) {
      operations.push({kind:'delete',id,org});
      return rows.get(id)?.organization_id === org ? rows.delete(id) : false;
    },
    async getTaskStats(id,org) {
      operations.push({kind:'stats',id,org});
      const row = rows.get(id);
      return row?.organization_id === org ? {total:2,completed:1} : {total:0,completed:0};
    },
  };
  return { store, rows, operations };
}

const requireStatus = (result: {ok:boolean;status?:number}, status:number) => {
  assert.equal(result.ok,false);
  if (result.ok === false) assert.equal(result.status,status);
};
async function main() {
  const {store,rows,operations}=fixture();
  // Valid own-org reads and org-scoped stats for all four canonical roles.
  for (const actor of [ownerA,adminA,memberA,viewerA]) {
    const own=await readCustomer(actor,customerA,store);
    assert.equal(own.ok,true);
    if (own.ok) { assert.equal(own.value.name,'Owned by A'); assert.deepEqual(own.value.taskStats,{total:2,completed:1}); }
    const list=await listCustomers(actor,store);
    assert.equal(list.ok,true);
    if (list.ok) assert.deepEqual(list.value.map(row=>row.id),[customerA]);
  }
  // Foreign ID must look exactly like an absent ID to prevent enumeration.
  const absent='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  for (const actor of [ownerA,adminA,memberA,viewerA]) {
    const foreign=await readCustomer(actor,customerB,store);
    const missing=await readCustomer(actor,absent,store);
    requireStatus(foreign,404); requireStatus(missing,404);
    if (foreign.ok === false && missing.ok === false) assert.equal(foreign.error,missing.error);
  }
  const bBefore=JSON.stringify(rows.get(customerB));
  requireStatus(await updateCustomer(ownerA,customerB,{name:'TAKEOVER'},store),404);
  requireStatus(await deleteCustomer(ownerA,customerB,store),404);
  requireStatus(await updateCustomer(adminA,customerB,{notes:'cross'},store),404);
  requireStatus(await deleteCustomer(adminA,customerB,store),404);
  assert.equal(JSON.stringify(rows.get(customerB)),bBefore,'foreign data must remain unchanged');

  // Concurrent attempts still use one organization-scoped write statement.
  const foreignOps=await Promise.all([
    updateCustomer(ownerA,customerB,{name:'race1'},store),
    updateCustomer(adminA,customerB,{name:'race2'},store),
    deleteCustomer(ownerA,customerB,store),
  ]);
  foreignOps.forEach(result=>requireStatus(result,404));
  assert.equal(JSON.stringify(rows.get(customerB)),bBefore);
  const lastMutations=operations.filter(op=>['update','delete'].includes(op.kind));
  assert.ok(lastMutations.every(op=>op.org===orgA),'no operation may mutate without organization scope');

  // Role matrix: Owner/Admin write; Member/Viewer read-only.
  for (const actor of [memberA,viewerA]) {
    requireStatus(await updateCustomer(actor,customerA,{name:'not allowed'},store),403);
    requireStatus(await deleteCustomer(actor,customerA,store),403);
    requireStatus(await createCustomer(actor,{name:'Not allowed'},store),403);
  }
  const allowed=await updateCustomer(adminA,customerA,{name:'Updated by admin'},store);
  assert.equal(allowed.ok,true);
  assert.equal(rows.get(customerA)?.name,'Updated by admin');
  requireStatus(await updateCustomer(ownerB,customerA,{name:'foreign update'},store),404);
  requireStatus(await deleteCustomer(ownerB,customerA,store),404);

  // Invalid/stale/missing session and forged roles fail closed before all IO.
  const accessCount=operations.length;
  for (const actor of [null,undefined,{id:'x',role:'admin'},{id:'x',organization_id:orgA,role:'superadmin'}] as CustomerActor[]) {
    const expected=actor?.id&&actor.organization_id?403:401;
    requireStatus(await readCustomer(actor,customerA,store),expected);
    requireStatus(await updateCustomer(actor,customerA,{name:'attempt'},store),expected);
    requireStatus(await deleteCustomer(actor,customerA,store),expected);
    requireStatus(await createCustomer(actor,{name:'attempt'},store),expected);
  }
  assert.equal(operations.length,accessCount,'unauthenticated or invalid users must cause zero DB queries');

  // Mass assignment, invalid body and bad IDs are rejected.
  requireStatus(await createCustomer(ownerA,{name:'Malicious',organization_id:orgB},store),400);
  requireStatus(await updateCustomer(ownerA,customerA,{organization_id:orgB},store),400);
  requireStatus(await updateCustomer(ownerA,customerA,{notes:{unexpected:'object'}},store),400);
  requireStatus(await readCustomer(ownerA,'not-a-uuid',store),404);
  requireStatus(await deleteCustomer(ownerA,'not-a-uuid',store),404);
  assert.ok(isCustomerId(customerA));
  assert.equal(isCustomerId('not-a-uuid'),false);
  const created=await createCustomer(ownerA,{name:'New A',email:'',notes:'ok'},store);
  assert.equal(created.ok,true);
  if (created.ok) { assert.equal(created.value.organization_id,orgA);assert.equal(created.value.email,null); }
  const ownDelete=await deleteCustomer(ownerA,customerA,store);
  assert.equal(ownDelete.ok,true);
  assert.equal(rows.has(customerA),false);

  // Regression contract: backend operations must apply BOTH filters to every
  // ID-based query, while task writes validate customer ownership before writing.
  const db=readFileSync('lib/db.ts','utf8');
  const scopedBlock=db.slice(db.indexOf('export const customerDb ='),db.indexOf('// WEBHOOK DATABASE OPERATIONS'));
  for (const operation of ['select','update','delete']) {
    const re=operation==='select'
      ? /\.select\('\*'\)\.eq\('id', id\)\.eq\('organization_id', organizationId\)/
      : operation==='update'
      ? /\.eq\('id', id\)\.eq\('organization_id', organizationId\)\.select\(\)\.maybeSingle\(\)/
      : /\.delete\(\)\.eq\('id', id\)\.eq\('organization_id', organizationId\)/;
    assert.match(scopedBlock,re,operation+' must be tenant-scoped');
  }
  assert.match(scopedBlock,/\.eq\('organization_id', organizationId\)\.eq\('customer_id', customerId\)/);
  for (const path of ['app/api/tasks/route.ts','app/api/tasks/[id]/route.ts']) {
    const content=readFileSync(path,'utf8');
    assert.match(content,/customerDb\.getById\(body\.customerId,\s*String\(/);
    assert.match(content,/isCustomerId\(body\.customerId\)/);
  }
  // No mock security components remain; do not accidentally re-add a fake UI.
  assert.equal(existsSync('components/TwoFactorModal.tsx'),false);
  assert.equal(existsSync('components/ActiveSessionsModal.tsx'),false);
  for (const path of ['components/Settings.tsx','app/(shell)/settings/account/page.tsx']) {
    const content=readFileSync(path,'utf8');
    assert.doesNotMatch(content,/TwoFactorModal|ActiveSessionsModal|Two-Factor Auth|Active Sessions/);
    assert.match(content,/ChangePasswordModal/);
  }
  const auth=readFileSync('lib/auth.ts','utf8');
  assert.match(auth,/strategy:\s*'jwt'/,'web JWT cannot safely enumerate/revoke individual sessions');
  console.log('Customer security: two-org multi-role CRUD + non-mutation + race + source-boundary contracts PASS');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
