# Actiproc marketing — editorial landing

The public landing is implemented in the Next.js app at `/marketing`.
Unauthenticated visitors at `/` are redirected there. The actual app is
unchanged; marketing is not a separate generated design or hard-coded HTML export.

## Product narrative

A compact path from **Capture → Process → Action → Planner → Knowledge Hub → AI**
with individual/team use cases, integrations and catalog-driven pricing.

- `app/(marketing)/marketing/page.tsx`: section order (server-rendered)
- `components/marketing/MarketingExperience.tsx`: hero, connected-workflow
  storytelling, product capabilities, teams, integrations, final CTA
- `components/marketing/MarketingWorkspacePreview.tsx`: small **illustrative**
  interactive tab demo (boards, planner, notes and AI); never reads real
  user data or claims to be the actual signed-in app
- `components/marketing/MarketingHeader.tsx` and `MarketingMobileMenu.tsx`:
  sticky desktop navigation and accessible collapsing mobile menu
- `components/marketing/sections/MarketingPricing.tsx`: four tiers from
  `ACTIPROC_PLANS` and AI allowances from `AI_PLAN_LIMITS`
- `components/marketing/MarketingFooter.tsx`: navigation, privacy, terms, refunds
- `app/(marketing)/marketing.css`: scoped Midnight/Porcelain tokens,
  responsive preview and reduced-motion implementation
- `app/(marketing)/layout.tsx`: metadata, canonical, OG/Twitter and JSON-LD

The original marketing demos and screenshot prototypes remain in
`components/marketing/` for potential reference, but are NOT rendered on the
public page. Do not re-add old placeholder screenshots or unsupported social
proof without checking live product accuracy.

## Guardrails

- Pricing: Free $0, Individual $12/year, Pro $4/seat/month,
  Team $6/seat/month. Checkout availability and taxes are not invented.
- AI: use real quota catalog and disclose service availability,
  per-user daily caps and verified-seat pools; no false unlimited claims.
- Do not fabricate customers, growth figures, testimonials or launch status.
- Marketing imagery/demos must be marked illustrative unless truly captured
  and verified against a specific app version.
- Use existing sign-up, sign-in, legal and Billing routes; marketing
  does not directly create subscriptions or invoke payment APIs.
- `vercel.json` retains `git.deploymentEnabled=false`. No live deployment
  takes place automatically after a GitHub push.

## Local QA

    git pull --ff-only origin main
    npm ci
    npx tsc --noEmit
    npx tsx scripts/test-marketing-premium.ts
    npm run test:ai:commercial-ui
    npm run test:creem
    npm run dev

For browser QA, start the local server at port 3217 and run:

    npm run dev -- -p 3217
    node scripts/test-marketing-browser.cjs

The GitHub `Premium landing page quality` workflow runs a real Chromium
test at 320, 375, 390, 768, 1024 and 1440 px. It validates page structure,
links, mobile navigation, preview tabs and horizontal overflow.
