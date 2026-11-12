# Groq model parameter compatibility — incident hardening

## What the screenshots establish

- The browser receives HTTP 200 from /api/ai/chat because this route streams SSE.
- The SSE body contains an error event with AI_UNAVAILABLE; HTTP 200 does NOT mean inference succeeded.
- The Free plan usage endpoint has remaining daily/monthly messages. This does not establish enough provider capacity or a successful model response.
- Origin=global means no Process/Team context was pinned in the conversation. This is not by itself an authorization failure.
- The screenshot request about checklists is classified as knowledge and, with 100% model canary, is **routed to Qwen**, not GPT-OSS. The particular request's reason requires the corresponding sanitized Vercel runtime error log.

## Confirmed compatibility defects fixed

Groq's model API rejects unsupported reasoning arguments with HTTP 400:
- Qwen 3.8 27B supports reasoning_effort=none/default/low/medium/high and reasoning_format=hidden.
- GPT-OSS 20B/120B supports reasoning_effort=low/medium/high. It does **not** support reasoning_format. To hide reasoning, use include_reasoning=false.
- The old code passed reasoning_format=hidden for GPT-OSS generation and reasoning_effort=none for the model tool selector. Both could be rejected.
- A shared provider adapter now enforces compatible parameters on streaming and non-streaming requests. Unknown model families do not receive speculative optional reasoning parameters.
- GPT-OSS model-led tool selection has a larger completion budget (640 tokens vs. Qwen's 280), and that budget is included in V2 provider admission.

This patch does not change model weights, provider keys, plan quotas, RLS, Notes, or Team access policies.

## Diagnostics

The safe server-side log event `ai_chat_failed` now records:
- requestId
- failureStage (workspace_read, context_preparation, provider_admission, read_tool_selection, model_generation, assistant_finalization)
- providerCategory, providerStatus and modelId
- durationMs, retryAfterMs and upstreamRequestId if supplied

No API key, prompt or private Notes contents are logged. For this specific incident, check the Vercel Runtime Logs around the local timestamp of the screenshot and filter on `ai_chat_failed`. If providerStatus=400, this is a model/tool request validation failure; 429 indicates provider capacity; 5xx indicates provider-side issue. If failureStage=workspace_read without a providerStatus, inspect the Supabase ACL/read-tool code instead.

Unrecognized 400 responses now return `PROVIDER_REQUEST_REJECTED` instead of generic `AI_UNAVAILABLE`. This preserves diagnostic specificity without exposing provider error bodies.

## Safe rollout

- Until validated, reduce `AI_MODEL_ROUTING_ROLLOUT_PERCENT` back to 0 (or `AI_MODEL_ROUTING_ENABLED=false`) and redeploy; do not claim this fixes already-pinned Qwen/tool-selection failures.
- Merge this patch after CI, deploy the updated production build separately; Vercel auto deploy remains disabled unless explicitly requested.
- Test one exact read-only Action question, the checklist question from the screenshot, a Notes question, and a general GPT-OSS conversation, then check the SSE result includes done and the corresponding server logs.
- Only raise canary to 5/25/100 after observing request success and error codes. Live Groq API/Production tenant tests were not performed by CI.

Official Groq references:
- https://console.groq.com/docs/reasoning
- https://console.groq.com/docs/api-reference
- https://console.groq.com/docs/tool-use/local-tool-calling
