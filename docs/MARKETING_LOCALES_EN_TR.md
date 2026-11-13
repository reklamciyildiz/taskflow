# Actiproc marketing bilingual release — English / Türkçe

## Routing
- English canonical landing: `/marketing`.
- Turkish canonical landing: `/marketing/tr`.
- Both pages are rendered as localized React content on the server, not client-side text-node replacement.
- The EN/TR navigation uses crawlable links and retains the active `#section` anchor.
- Turkish metadata includes separate title, description, keywords, `tr_TR` OpenGraph locale, canonical and cross-language alternatives.
- The shared root layout currently sets `<html lang="en">`; the marketing-specific client component updates the document language to `tr` on the Turkish route after hydration. A server-rendered root `lang` would require refactoring the application's shared root layout, intentionally excluded to avoid altering signed-in app behavior.
- All authenticated features, plans, payments and data model are unchanged.

## Translation coverage
- Global landing navigation, footer, FAQ, community feedback section and all hero/feature copy.
- Interactive example product: Process/Action boards, Planner, Knowledge Hub, AI responses, insights and teams.
- Audience segment switcher, badges, instructions and illustrative status labels.
- Pricing card labels, billing-period selection, plan features, AI daily limits and explanatory notes. Monetary plan prices always use existing plan catalog; language switching never modifies USD prices or provider checkout configuration.
- English is the default and remains unchanged.
- Language selection does not create or modify a user account or track visitor behavior.
- The landing is intentionally English-first by default; `/marketing/tr` is directly shareable, no IP geolocation or guessed language changes.

## Tests and release
- `npx tsx scripts/test-marketing-premium.ts` includes explicit locale contracts.
- `node scripts/test-marketing-browser.cjs` tests English across 320/375/390/768/1024/1440 and Turkish at 375/1024/1440, with active locale switch, restored `#community` anchor and zero overflow/browser errors.
- `npx tsc --noEmit` and existing AI/Creem/entitlement test workflows run in PR.
- Deployments remain **manual**. `vercel.json` has `git.deploymentEnabled=false`; merging to main does not publish.
- Release smoke: use `/marketing` and `/marketing/tr`, test switches at mobile+desktop, inspect `#pricing`, interactive demo, protected `/feedback`, browser back navigation and Turkish metadata.

## Maintainability
- English source strings map to curated Turkish phrases in `lib/marketing-locale.ts`.
- An unknown phrase safely retains the English source rather than rendering an empty string.
- Demo data is fictional and remains clearly labeled. No actual workspace data is read by public marketing pages.
- Navigation labels and assistive technology titles are localized where relevant.
