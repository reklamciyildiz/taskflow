import { ACTIPROC_PLANS, type PaidActiprocPlan } from './billing-plans';

export type UpgradePlan = PaidActiprocPlan;
export type UpgradeReason = 'teams' | 'processes' | 'webhooks' | 'seats';
export type CurrentPlan = 'free' | UpgradePlan;

const PLAN_ORDER:readonly CurrentPlan[]=['free','individual','pro','team'];
const PAID_PLANS:readonly UpgradePlan[]=['individual','pro','team'];

function nextHigherPlans(currentPlan:CurrentPlan):UpgradePlan[]{
  const rank=PLAN_ORDER.indexOf(currentPlan);
  return PAID_PLANS.filter(plan=>PLAN_ORDER.indexOf(plan)>rank);
}

/**
 * Only offer plans that can actually create another Process. Legacy/free
 * over-limit organizations may already have 3+ Processes, so simply listing
 * the next tier can sell them a plan that cannot satisfy their request.
 *
 * This is presentation/upsell policy, NOT entitlement authorization.
 */
export function processUpgradeOptions(
  currentPlan:CurrentPlan,
  existingProcessCount:number,
):UpgradePlan[]{
  const count=Number.isFinite(existingProcessCount)&&existingProcessCount>=0
    ?Math.floor(existingProcessCount)
    :Number.POSITIVE_INFINITY; // malformed data must not promise capacity
  return nextHigherPlans(currentPlan).filter(plan=>
    ACTIPROC_PLANS[plan].maxProcesses>count);
}

export function recommendedProcessUpgrade(
  currentPlan:CurrentPlan,
  existingProcessCount:number,
):UpgradePlan|null{
  return processUpgradeOptions(currentPlan,existingProcessCount)[0]??null;
}

/**
 * A recommendation highlights the best fit; it must not hide other eligible
 * options. The feature gate and the organization's existing limits determine
 * which plans can solve the user's need.
 */
export function getUpgradeModalPlans(input:{
  reason?:UpgradeReason;
  currentPlan?:CurrentPlan|null;
  existingProcessCount?:number|null;
  recommendedPlan?:UpgradePlan|null;
}):UpgradePlan[]{
  const {reason,currentPlan,existingProcessCount,recommendedPlan}=input;
  if(reason==='webhooks')return currentPlan==='team'?[]:['team'];
  if(reason==='processes'){
    if(currentPlan){
      if(typeof existingProcessCount==='number')return processUpgradeOptions(currentPlan,existingProcessCount);
      return nextHigherPlans(currentPlan);
    }
    // A caller without verified plan/count information should show the full
    // catalog. A recommendation is never evidence that lower tiers are invalid.
    return [...PAID_PLANS];
  }
  if(reason==='teams'){
    if(currentPlan==='team')return [];
    if(currentPlan==='pro')return ['team'];
    return ['pro','team']; // Individual has only one workspace.
  }
  if(reason==='seats'){
    if(currentPlan==='team')return [];
    if(currentPlan==='individual')return ['pro','team'];
    if(currentPlan==='free')return [...PAID_PLANS]; // Individual supports paid seats.
    return ['pro','team'];
  }
  // Generic upgrade prompts retain historical recommendations, but never
  // silently remove another valid tier solely because one was suggested.
  if(currentPlan)return nextHigherPlans(currentPlan);
  if(recommendedPlan==='team')return ['team'];
  return [...PAID_PLANS];
}
