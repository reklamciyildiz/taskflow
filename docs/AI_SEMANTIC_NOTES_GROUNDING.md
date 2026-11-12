# AI Notes Grounding & Semantic Read Tools — V3

## Why this change

A user could ask "en son aldığım not ne benim?" or "what is my last note" and receive a generic model statement saying it had no access to Notes even though Notes existed. This was not fixed by switching Groq models.

Root causes:
- The old direct router recognized some specific Note inflections but not the natural Turkish singular "not".
- The recent Notes tool searched only Notes linked to a bounded recent Action sample; a real latest Note attached to an older Action could be invisible to that scan.
- When the LLM suggested a read tool, its successful result was not always rendered as a verified deterministic answer.
- Ambiguous conversational requests were frequently passed straight to generation with no attempt to select authorized workspace tools.

## Implementation

1. Fast, deterministic latest Note path: \`get_notes\` reads live \`public.notes\` rows, sorts by creation time for "last added/written" and modification time for "last edited". "Mine" is \`author_id = authenticated user\`, distinct from "accessible" team notes.
2. Semantic read-tool selection remains **read-only**, can select zero tools, and uses the last conversation turns and server-supplied current Process/Team ID. The selected tool is revalidated server-side. High-confidence direct queries do not incur the extra LLM request.
3. Exact results are rendered from authenticated records (title, date, related Action/Process, bounded text preview); no second LLM completion or hallucinated empty-state assertions.
4. Recent workspace Notes are now read from Notes directly rather than through the first 501 Actions. Every Note must pass the authorization predicate: member Team, unchanged task Team, permitted Process and current organization.
5. Queries with many records have scan limits and partial-result disclosure. No open-ended unbounded scans or excessive database writes.
6. Model read tool context trims complete Note entries instead of silently truncating invalid JSON.
7. Existing write/proposal tools, conversation history, billing entitlement and model V2 flags are unchanged.

## Security and limitations

- No new database migrations or public API routes are required. Only server-side read tools are added.
- Notes of teammates are excluded from \`authorScope: mine\` by default; requesting all visible workspace Notes uses \`authorScope: accessible\`.
- A private/restricted Process never becomes accessible merely because a user belongs to its Team or authored a Note. Authorization is evaluated against current project visibility.
- For exact topic search, the authorized bounded Note sample is matched by normalized text; for semantic document retrieval the existing Knowledge Hub RAG tool is still available. The scan does not falsely claim exhaustive results at the configured cap.
- This change does NOT prove that every natural-language expression will always be understood. Track routing success, verification, token costs and false zero cases.
- If \`AXIOM_AI_READ_TOOLS_ENABLED\` is not \`true\` in Production, these tools intentionally remain disabled.
- LLM-based planning of ambiguous personal/workspace questions incurs extra token cost. Capacity and error rates should be monitored.

## Verification

- \`npx tsx scripts/test-ai-semantic-notes.ts\`
- \`npx tsx scripts/test-ai-workspace-grounding.ts\`
- \`npx tsx scripts/test-ai-tr-process-context.ts\`
- \`npx tsx scripts/test-ai-read-tools.ts\`
- \`npx tsc --noEmit\`, \`npm run lint\`, \`npm run build\`

Actual production user Notes and RLS must be tested manually before declaring end-to-end reliability. Vercel Git auto-deployment remains disabled.
