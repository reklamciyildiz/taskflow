# Actiproc public landing — P2.3 and P3.1 product-story integration

## Confirmed, implemented product facts

This change updates the active bilingual marketing routes `/marketing` and `/marketing/tr` only, without replacing the existing landing design or product preview. The source of truth is the merged **P2.3 Smart Dependencies** and **P3.1 Advanced Reporting** features in `main`.

### Smart Dependencies (P2.3)
- Same-team Action prerequisites; cyclic links and invalid completion are server/DB guarded.
- Action Panel link/unlink, blockers and dependents; Board/List blocked, ready and blocking indicators.
- Automatically reflecting a completed prerequisite is **not** automatic stage movement, calendar rescheduling or guaranteed unblock push notifications.
- Role/Process visibility restrictions still apply.

### Advanced Reporting (P3.1)
- A separate `Analytics → Advanced reports` view, preserving the original Overview.
- Process, assignee and 7/30/90-day period filters; current workload metrics; verified completion history; at-risk Actions and scoped CSV.
- Charts are **not** a complete historical event ledger; deleted tasks and earlier reopen transitions are not reconstructed.
- Existing team task API is not paginated. Large-team safeguards warn of incomplete data and block misleading CSV exports.

## Marketing UI implementation

- Added a prominent, accessible interactive story section **#smart-workflows** between the full feature grid and the team story.
- Two-tab client showcase, English/Turkish:
  1. Dependencies: three sample Actions, toggling prerequisite completed/reopened, two realistic downstream states.
  2. Reporting: three static 7/30/90-day data sets, illustrative metrics and comparative bars.
- The demos are client-only with **invented sample values**. They never request authenticated workspace data or mutate user tasks.
- Added two accurate feature cards (total now 14), linked section CTA, two new FAQ answers, desktop and mobile navigation, footer, SEO/JSON-LD feature list and Turkish metadata.
- Corrected existing feature card title localization and a hard-coded English header CTA.
- Kept canonical pricing and plan descriptions generated from existing shared billing entitlement catalog; did not invent a new plan or promise features for every tier.

## Quality gate / acceptance

`scripts/test-marketing-premium.ts`: feature/source truth, 14 feature translations, accessibility markers, fake-data guard, SEO, links, protected deployment configuration, unchanged Creem pricing.

`scripts/test-marketing-browser.cjs`: real Playwright Chromium validation across widths **320, 375, 390, 768, 1024 and 1440 px**, plus Turkish at 375/1024/1440. Verifies no horizontal document overflow, no JS exceptions, both interactive demos, blocked/ready transitions, filter controls, Arrow key tab navigation, localized UI and prior product/price/feedback interactions.

Deployment is still manual-only (`vercel.json` remains `git.deploymentEnabled:false`). Do not enable auto deploy as part of this marketing code update.

## Future roadmap — not advertised as shipped

Portfolios, Goals, Gantt, unblock push notifications, automatic stage movement and full historical event-based reporting require separate confirmed releases. Do not add them to the feature list before implementation.
