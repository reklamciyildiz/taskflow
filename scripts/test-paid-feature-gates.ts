import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canUsePaidFeature, hasOnlyBasicReminderRules } from '@/lib/paid-feature-policy';
import type { Entitlements } from '@/lib/entitlements';

const ent=(plan: Entitlements['plan'], status: Entitlements['subscriptionStatus']='active',
  endsAt:string|null=null):Pick<Entitlements,'plan'|'subscriptionStatus'|'endsAt'>=>({plan,subscriptionStatus:status,endsAt});
const yes=(plan:Entitlements['plan'],feature:'google_calendar'|'advanced_reminders'|'webhooks')=>
  canUsePaidFeature(ent(plan),feature);
for(const feature of ['google_calendar','advanced_reminders'] as const) {
  assert.equal(yes('free',feature),false);
  assert.equal(yes('individual',feature),false);
  assert.equal(yes('pro',feature),true);
  assert.equal(yes('team',feature),true);
}
assert.equal(yes('team','webhooks'),true);
assert.equal(yes('pro','webhooks'),false);
for(const status of ['expired','past_due','paused'] as const) {
  assert.equal(canUsePaidFeature(ent('team',status),'webhooks'),false);
  assert.equal(canUsePaidFeature(ent('pro',status),'google_calendar'),false);
  assert.equal(canUsePaidFeature(ent('pro',status),'advanced_reminders'),false);
}
assert.equal(canUsePaidFeature(ent('team','cancelled',new Date(Date.now()+86_400_000).toISOString()),'webhooks'),true);
assert.equal(canUsePaidFeature(ent('team','cancelled',new Date(Date.now()-86_400_000).toISOString()),'webhooks'),false);
assert.equal(canUsePaidFeature(ent('team','active',new Date(Date.now()-86_400_000).toISOString()),'webhooks'),false);
assert.equal(hasOnlyBasicReminderRules([],undefined),true);
assert.equal(hasOnlyBasicReminderRules([{type:'preset',preset:'when_due'}]),true);
assert.equal(hasOnlyBasicReminderRules([{type:'absolute',at:'2026-11-10T08:00:00Z'}],'2026-11-10T08:00:00Z'),true);
assert.equal(hasOnlyBasicReminderRules([{type:'preset',preset:'5m_before'}]),false);
assert.equal(hasOnlyBasicReminderRules([{type:'absolute',at:'2026-11-10T07:55:00Z'}],'2026-11-10T08:00:00Z'),false);
assert.equal(hasOnlyBasicReminderRules([{type:'unknown'}]),false);
const read=(file:string)=>readFileSync(file,'utf8');
const sourceRules:Record<string,boolean>={
  'public capabilities authenticated':read('app/api/entitlements/capabilities/route.ts').includes('requireAuthedUser(request)'),
  'public capabilities no-store':read('app/api/entitlements/capabilities/route.ts').includes('private, no-store'),
  'Google OAuth start gated':read('app/api/integrations/google/start/route.ts').includes('requireGoogleCalendarAccess()'),
  'Google OAuth callback gated':read('app/api/integrations/google/callback/route.ts').includes('requireGoogleCalendarAccess(request)'),
  'Google calendars gated':read('app/api/integrations/google/calendars/route.ts').includes("canUsePaidFeature(ent, 'google_calendar')"),
  'Google connection changes gated':read('app/api/integrations/google/connection/route.ts').includes("canUsePaidFeature(ent, 'google_calendar')"),
  'Google persisted sync gated':read('lib/google-calendar-sync.ts').includes("canUsePaidFeature(ent, 'google_calendar')"),
  'Calendar settings show paywall':read('components/settings/CalendarSettings.tsx').includes('googleEligible'),
  'advanced reminder picker no optimistic paid default':!read('components/schedule/WorkSchedulePicker.tsx').includes('canUseAdvancedReminderPresets = true'),
  'advanced reminder picker gets capabilities':read('components/schedule/WorkSchedulePicker.tsx').includes('/api/entitlements/capabilities'),
  'action note advanced reminder gate scoped to member':read('components/ActionPanel.tsx').includes('/api/entitlements/capabilities'),
  'schedule persistence checks entitlements':(read('lib/work-schedule-server.ts').match(/assertReminderPlanAccess\(actor, normalized\)/g)??[]).length===3,
  'webhook dispatch checks current plan':read('lib/webhook-trigger.ts').includes('if (!getPlanLimits(ent).canUseWebhooks) return'),
  'webhook retry checks current plan':read('lib/webhook-trigger.ts').includes('if (!getPlanLimits(ent).canUseWebhooks) {'),
};
for(const [name,valid] of Object.entries(sourceRules))assert.equal(valid,true,'Source contract: '+name);
console.log('Premium entitlement policy/scoping: '+Object.keys(sourceRules).length+' integration contracts + pure policy matrix passed.');
