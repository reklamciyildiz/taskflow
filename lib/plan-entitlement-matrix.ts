import { ACTIPROC_PLANS } from './billing-plans';
import { AI_PLAN_LIMITS } from './ai/ai-plan-catalog';

export type ActiprocPlan = keyof typeof ACTIPROC_PLANS;
export type ActiprocFeature =
  | 'actions' | 'checklists' | 'notes' | 'knowledge_hub' | 'inbox'
  | 'planner' | 'process_properties' | 'attachments' | 'ai_chat'
  | 'team_membership' | 'role_assignment' | 'google_calendar'
  | 'advanced_reminders' | 'webhooks';

/** Default distinct member capacity is legacy behavior, not new commercial policy.
 * Paid Team subscriptions instead use verified purchased seats; manually
 * granted developer Team organizations may keep their legacy unlimited seats.
 */
export const ACTIPROC_DEFAULT_SEAT_LIMITS = {
  free: 1,
  individual: 1,
  pro: 1,
  team: Number.POSITIVE_INFINITY,
} as const;

/** Public capability catalog: never use client-side values as permission tokens. */
export const ACTIPROC_FEATURE_TIERS: Readonly<Record<ActiprocFeature, readonly ActiprocPlan[]>> = {
  actions: ['free', 'individual', 'pro', 'team'],
  checklists: ['free', 'individual', 'pro', 'team'],
  notes: ['free', 'individual', 'pro', 'team'],
  knowledge_hub: ['free', 'individual', 'pro', 'team'],
  inbox: ['free', 'individual', 'pro', 'team'],
  planner: ['free', 'individual', 'pro', 'team'],
  process_properties: ['free', 'individual', 'pro', 'team'],
  attachments: ['free', 'individual', 'pro', 'team'],
  ai_chat: ['free', 'individual', 'pro', 'team'],
  team_membership: ['free', 'individual', 'pro', 'team'],
  role_assignment: ['free', 'individual', 'pro', 'team'],
  google_calendar: ['pro', 'team'],
  advanced_reminders: ['pro', 'team'],
  webhooks: ['team'],
};

export function planIncludesFeature(plan: ActiprocPlan, feature: ActiprocFeature): boolean {
  return ACTIPROC_FEATURE_TIERS[feature].includes(plan);
}

/** Marketing shares the billing plan limits rather than repeating numbers. */
export const PLAN_MARKETING_FEATURES: Readonly<Record<ActiprocPlan, readonly string[]>> = {
  free: [
    '1 seat included',
    ACTIPROC_PLANS.free.maxProcesses + ' process',
    ACTIPROC_PLANS.free.maxTeams + ' workspace',
    'Actions, checklists & notes',
    'Knowledge Hub & basic planner',
  ],
  individual: [
    ACTIPROC_PLANS.individual.maxProcesses + ' processes',
    ACTIPROC_PLANS.individual.maxTeams + ' workspace',
    'Actions, notes & Knowledge Hub',
    'Per-seat annual billing',
    'Purchased seats determine team capacity',
  ],
  pro: [
    ACTIPROC_PLANS.pro.maxProcesses + ' processes',
    'Up to ' + ACTIPROC_PLANS.pro.maxTeams + ' workspaces',
    'Advanced reminders',
    'Google Calendar sync',
  ],
  team: [
    'Unlimited processes',
    'Unlimited workspaces',
    'Team webhooks',
    'Collaborative roles & assignments',
  ],
};

/** Published plan values; effective limits can be lower for inactive subscriptions. */
export function publishedPlanSnapshot(plan: ActiprocPlan) {
  return {
    maxProcesses: ACTIPROC_PLANS[plan].maxProcesses,
    maxTeams: ACTIPROC_PLANS[plan].maxTeams,
    aiDailyPerUser: AI_PLAN_LIMITS[plan].dailyPerUser,
    aiMonthlyBase: AI_PLAN_LIMITS[plan].monthlyBase,
    aiPerSeat: AI_PLAN_LIMITS[plan].perSeat,
  };
}
