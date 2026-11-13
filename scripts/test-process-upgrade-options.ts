import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTIPROC_PLANS,actiprocPriceUsd,billingIntervalForPlan} from '../lib/billing-plans';
import {
  getUpgradeModalPlans,processUpgradeOptions,recommendedProcessUpgrade,
  type CurrentPlan,
} from '../lib/upgrade-recommendations';

const cases:Array<{
  plan:CurrentPlan;processes:number;options:readonly string[];recommended:string|null;
}>=[
  {plan:'free',processes:1,options:['individual','pro','team'],recommended:'individual'},
  {plan:'free',processes:2,options:['individual','pro','team'],recommended:'individual'},
  {plan:'free',processes:3,options:['pro','team'],recommended:'pro'},
  {plan:'free',processes:10,options:['team'],recommended:'team'},
  {plan:'individual',processes:3,options:['pro','team'],recommended:'pro'},
  {plan:'individual',processes:10,options:['team'],recommended:'team'},
  {plan:'pro',processes:10,options:['team'],recommended:'team'},
  {plan:'pro',processes:20,options:['team'],recommended:'team'},
  {plan:'team',processes:100,options:[],recommended:null},
];
for(const sample of cases){
  const options=processUpgradeOptions(sample.plan,sample.processes);
  assert.deepEqual(options,sample.options,JSON.stringify(sample));
  const recommended=recommendedProcessUpgrade(sample.plan,sample.processes);
  assert.equal(recommended,sample.recommended,JSON.stringify(sample));
  assert.deepEqual(
    getUpgradeModalPlans({
      reason:'processes',currentPlan:sample.plan,
      existingProcessCount:sample.processes,recommendedPlan:recommended,
    }),
    options,
  );
  for(const option of options)
    assert.ok(ACTIPROC_PLANS[option].maxProcesses>sample.processes,
      'Never sell a plan that still blocks Process creation');
}
assert.deepEqual(processUpgradeOptions('free',-1),[]);
assert.deepEqual(processUpgradeOptions('free',Number.NaN),[]);
assert.deepEqual(processUpgradeOptions('free',Number.POSITIVE_INFINITY),[]);
assert.deepEqual(processUpgradeOptions('free',3.9),['pro','team']);

// A recommendation is NOT the visible plan list. When caller has not supplied
// authoritative context, do not hide Individual merely because Pro was suggested.
assert.deepEqual(getUpgradeModalPlans({
  reason:'processes',recommendedPlan:'pro',
}),['individual','pro','team']);
assert.deepEqual(getUpgradeModalPlans({
  reason:'processes',recommendedPlan:'team',
}),['individual','pro','team']);
assert.deepEqual(getUpgradeModalPlans({
  reason:'processes',currentPlan:'free',existingProcessCount:1,recommendedPlan:'pro',
}),['individual','pro','team']);
assert.deepEqual(getUpgradeModalPlans({
  reason:'processes',currentPlan:'individual',existingProcessCount:3,recommendedPlan:'team',
}),['pro','team']);
assert.deepEqual(getUpgradeModalPlans({
  reason:'processes',currentPlan:'pro',existingProcessCount:10,recommendedPlan:'individual',
}),['team']);
assert.deepEqual(getUpgradeModalPlans({
  reason:'processes',currentPlan:'individual',
}),['pro','team']);

// Upgrades for features Individual does not provide must keep the existing
// entitlement gates. Webhooks remain Team-only and a second Team requires Pro+.
assert.deepEqual(getUpgradeModalPlans({reason:'teams',recommendedPlan:'pro'}),['pro','team']);
assert.deepEqual(getUpgradeModalPlans({reason:'teams',currentPlan:'free'}),['pro','team']);
assert.deepEqual(getUpgradeModalPlans({reason:'teams',currentPlan:'individual'}),['pro','team']);
assert.deepEqual(getUpgradeModalPlans({reason:'teams',currentPlan:'pro'}),['team']);
assert.deepEqual(getUpgradeModalPlans({reason:'teams',recommendedPlan:'team'}),['team']);
assert.deepEqual(getUpgradeModalPlans({reason:'seats',recommendedPlan:'team'}),['team']);
assert.deepEqual(getUpgradeModalPlans({reason:'webhooks',currentPlan:'free'}),['team']);
assert.deepEqual(getUpgradeModalPlans({reason:'webhooks',currentPlan:'pro'}),['team']);
assert.deepEqual(getUpgradeModalPlans({reason:'seats'}),['pro','team']);
assert.deepEqual(getUpgradeModalPlans({reason:'seats',currentPlan:'free'}),['individual','pro','team']);
assert.deepEqual(getUpgradeModalPlans({reason:'seats',currentPlan:'individual'}),['pro','team']);
assert.deepEqual(getUpgradeModalPlans({reason:'seats',currentPlan:'pro'}),['pro','team']);

// Billing duration remains explicitly yearly for Individual, regardless of
// monthly vs annual Pro/Team selector. Prices all derive from one catalog.
assert.equal(ACTIPROC_PLANS.individual.maxProcesses,3);
assert.equal(actiprocPriceUsd('individual','monthly'),12);
assert.equal(actiprocPriceUsd('individual','yearly'),12);
assert.equal(billingIntervalForPlan('individual','monthly'),'yearly');
assert.equal(actiprocPriceUsd('pro','monthly'),4);
assert.equal(actiprocPriceUsd('pro','yearly'),40);

const source=(file:string)=>readFileSync(file,'utf8');
const projectRoute=source('app/api/projects/route.ts');
const create=source('components/CreateProjectModal.tsx');
const modal=source('components/billing/UpgradePlanModal.tsx');
assert.match(projectRoute,/recommendedProcessUpgrade\(ent\.plan, existingCount\)/);
assert.match(projectRoute,/currentProcessCount: existingCount/);
assert.match(projectRoute,/currentPlan: ent\.plan/);
assert.match(create,/proposed === 'individual'/);
assert.match(create,/existingProcessCount=\{upgradeProcessCount\}/);
assert.match(create,/currentPlan=\{upgradeCurrentPlan\}/);
assert.match(modal,/getUpgradeModalPlans\(/);
assert.match(modal,/Annual billing only/);
assert.match(modal,/recommendedPlan && plans\.includes\(recommendedPlan\)/);
assert.match(modal,/\/api\/billing\/summary/);
assert.match(modal,/\/api\/billing\/checkout/);
assert.match(modal,/billingInterval: plan === 'individual' \? 'yearly' : interval/);
assert.match(modal,/Purchases and plan upgrades are unavailable in the native app/);
assert.doesNotMatch(modal,/recommendedPlan === 'pro'\) return \['pro', 'team'\]/);
console.log(JSON.stringify({
  suite:'process-paywall-upgrade-options',status:'passed',
  cases:cases.length,readOnly:true,
  providerCalls:false,productionDbCalls:false,
}));
