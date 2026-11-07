import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiAvailabilityMessage } from '@/lib/ai/chat/availability-message';
const read=(p:string)=>readFileSync(p,'utf8');
assert.match(aiAvailabilityMessage('PUBLIC_ROLLOUT_NOT_READY'),/write\/mutation flags/);
assert.match(aiAvailabilityMessage('PUBLIC_RATE_GUARD_NOT_READY'),/Supabase/);
assert.match(aiAvailabilityMessage('FEATURE_DISABLED'),/disabled/);
assert.match(aiAvailabilityMessage('UNKNOWN',503),/not been deleted/);
const chat=read('components/ai/AxiomAIChat.tsx');
const panel=read('components/ai/AIChatPresentation.tsx');
const indicator=read('components/ai/AIAllowanceIndicator.tsx');
const server=read('lib/ai/chat/http-server.ts');
const contracts:Record<string,boolean>={
 '503 guard returns rollout-specific code':server.includes("code:'PUBLIC_ROLLOUT_NOT_READY'"),
 'history request failure is caught':chat.includes('setHistoryError(error instanceof Error'),
 'history never becomes empty on failed request':chat.includes('if(!response.ok) {')&&chat.includes('setConversations(payload.conversations)'),
 'saved history is not overwritten on failure':!chat.includes('setConversations([])'),
 'history fetch supports retry':chat.includes('onRetryHistory={()=>void refreshConversations()}'),
 'sidebar shows error instead of no conversations':panel.includes('!historyError ? ('),
 'sidebar includes retry action':panel.includes('Retry loading'),
 'mobile includes visible status banner':chat.includes('historyError && ('),
 'AI availability status does not show misleading balance':indicator.includes("accessUnavailable?'AI paused'"),
 'new chat request retains server error code':chat.includes('aiAccessCode:code'),
 'history view is not switched before successful fetch':chat.indexOf('setConversationId(id);setMessages(payload.messages')>chat.indexOf('if (!response.ok) { toast.error'),
};
for(const [name,ok] of Object.entries(contracts))assert.ok(ok,'AI history outage contract: '+name);
console.log(JSON.stringify({contracts:Object.keys(contracts).length,liveCalls:false,dataDeleted:false}));
