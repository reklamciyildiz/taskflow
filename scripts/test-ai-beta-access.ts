import assert from 'node:assert/strict';
import { aiBetaOrganizationIds,isAIBetaModeEnabled,isAIBetaScopeAllowed } from '../lib/ai/beta-access';

const user='20000000-0000-4000-8000-000000000001';
const organization='10000000-0000-4000-8000-000000000001';
const saved={
  mode:process.env.AXIOM_AI_BETA_MODE_ENABLED,
  users:process.env.AXIOM_AI_BETA_USER_IDS,
  organizations:process.env.AXIOM_AI_BETA_ORGANIZATION_IDS,
};

try {
  delete process.env.AXIOM_AI_BETA_MODE_ENABLED;
  delete process.env.AXIOM_AI_BETA_USER_IDS;
  delete process.env.AXIOM_AI_BETA_ORGANIZATION_IDS;
  assert.equal(isAIBetaModeEnabled(),true);
  assert.equal(isAIBetaScopeAllowed(user,organization),false);

  process.env.AXIOM_AI_BETA_USER_IDS=user;
  assert.equal(isAIBetaScopeAllowed(user,organization),false);
  process.env.AXIOM_AI_BETA_ORGANIZATION_IDS=organization;
  assert.deepEqual(aiBetaOrganizationIds(),[organization]);
  assert.equal(isAIBetaScopeAllowed(user,organization),true);
  assert.equal(isAIBetaScopeAllowed('20000000-0000-4000-8000-000000000002',organization),false);
  assert.equal(isAIBetaScopeAllowed(user,'10000000-0000-4000-8000-000000000002'),false);

  process.env.AXIOM_AI_BETA_MODE_ENABLED='false';
  assert.equal(isAIBetaScopeAllowed('not-used','not-used'),true);
  process.env.AXIOM_AI_BETA_MODE_ENABLED='true';
  process.env.AXIOM_AI_BETA_ORGANIZATION_IDS='invalid';
  assert.throws(()=>aiBetaOrganizationIds(),/Invalid AXIOM_AI_BETA_ORGANIZATION_IDS configuration/);
} finally {
  const restore=(name:string,value:string|undefined)=>value===undefined
    ? delete process.env[name]
    : void (process.env[name]=value);
  restore('AXIOM_AI_BETA_MODE_ENABLED',saved.mode);
  restore('AXIOM_AI_BETA_USER_IDS',saved.users);
  restore('AXIOM_AI_BETA_ORGANIZATION_IDS',saved.organizations);
}

console.log('AI beta access regression tests passed');
