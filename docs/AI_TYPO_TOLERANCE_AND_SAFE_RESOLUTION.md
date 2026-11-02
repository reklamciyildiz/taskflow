# Actiproc AI — typo-tolerant natural language, safe canonical actions

## Scope

This change improves how Actiproc AI understands ordinary Turkish/English
requests with missing filler words, informal inflections and mistyped Process,
Action, Stage (board column), or Checklist labels. It does not activate
disabled write tools or grant anyone new capabilities.

### Resolution policy

- Normalize Turkish-specific characters and casing consistently.
- Match exact labels first, bounded whole-word partial names second, and only
  then very-close Damerau–Levenshtein typos. For very short names, do not
  guess. Common stage concepts (e.g. **devam eden** → **In Progress**) map
  only when exactly one stage in that Process has the meaning.
- A fuzzy or translated name can only match candidates already returned from
  the caller's **authorized writable/readable scope**. No guessing UUIDs.
- Two equally plausible candidates cause a clarification request rather
  than creation/editing on a guessed target.
- Incorrect explicit IDs fail closed. If both ID and name are provided,
  they **must** agree; otherwise the proposal is rejected for clarification.
- If a user requests a Stage by name, never silently place a new Action in
  the first/initial Stage if the name cannot be resolved.
- The immutable approval proposal displays canonical `Process / Stage` and
  a **Yazım eşleştirmesi · onaylayın** field for corrected/translated Stage
  names. Nothing changes until the user separately presses approval.
- Read-only Process searches are tolerant but cannot simply return the first
  partially matching Process when multiple names overlap.
- Missing an explicitly required Process/Action/Stage uses a conversational
  clarification with authorized candidate labels, instead of fabricated data.

### Manual acceptance examples

| Example prompt | Expected behavior |
| --- | --- |
| `Alumas processinde in proggress kolonuna Test action oluştur` | Propose **Test** under **Alumas / In Progress**; display corrected canonical Stage |
| `Alumas processinde devam eden kolona Test aksiyonu ekleyelim` | Same Stage only if it uniquely corresponds to **In Progress** |
| `Alumas processinde in progess kolonunda Test action oluştur` | Near-typo match, with confirmation |
| `Alumas processinde Unknown Stage kolonuna Test ekle` | Clarify Stage, never choose To Do silently |
| `In Progress` and `In Proggres` both present | Clarify ambiguity; no proposal |
| Incorrect Process UUID plus matching other Process name | Reject ID/name conflict |
| Typo in existing Action/Checklist name | Match only one writable authorized target, retain approval |
| User asks `Kaç action var?` | No write proposal; read-only intent |
| User cancels a proposal | No write to Action, Stage or Note data |

### Limits and rollout

The current AI proposal tools include `create_action`, `create_note`,
`update_checklist`, `update_action` and `schedule_action`.
**There is currently no `create_process` tool.** A prompt asking to create
a brand-new Process must not pretend to have created one. The separate
Process creation capability would need its own canonical API, authorization,
billing capacity, proposal type and migration review.

Public AI v1 still runs read-only: `AXIOM_AI_WRITE_TOOLS_ENABLED=false` and
`AXIOM_AI_ACTION_MUTATION_TOOLS_ENABLED=false`. These matching changes
apply to proposal tools **only when those tools are separately authorized**
for an approved beta cohort. The user must review the proposal card; this
feature does not change the existing write rollout policy.

No Supabase migration, Creem plan change, or Vercel environment mutation is
included in this PR. Test suites: `npm run test:ai:typo`,
`npx tsx scripts/test-ai-write-tools.ts`,
`npx tsx scripts/test-ai-read-tools.ts`, full AI/TypeScript CI.

Remaining live QA: try the examples in a verified beta environment with
approved write-tool flags, and confirm Stage corrections/proposal approvals
with real authorized organization records before calling it production-ready.
