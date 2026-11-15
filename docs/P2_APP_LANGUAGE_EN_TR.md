# Actiproc P2.1 — Centralized application localization (EN/TR)

## Implemented architecture
- Authenticated web shell uses `AppLocaleProvider` inside `ShellProviders`, separate from SEO-enabled marketing locales. The Capacitor/Vite native entry also mounts `SessionProvider → AppLocaleProvider` around its native screens, reusing one central catalog.
- Central source-string dictionary `lib/i18n/catalog.ts` and pure formatters in `lib/i18n/app-locale.ts`. Add future languages by extending `APP_LOCALES`, catalog, locale validation and DB check constraint together.
- English is the default. Turkish selected through Settings → Appearance or the Header / mobile user menu. No translation service calls or AI model cost.
- Translation happens at component render, not via DOM text mutation. This preserves React event handlers and avoids overwriting user-generated text.
- The user's own Action titles, Process names, Notes, comments, customer names, email content and AI responses are **not** automatically translated.
- Dates, numbers and currency can be locale-formatted using `useAppLocale().date / number / money`.
- Per-user preference is stored in `user_settings.locale`. The browser cache is used for fast UI startup and refreshed from server; settings API only accepts `en` or `tr`, tied to authenticated user's id.
- Updates show errors and revert optimistic state when DB writes fail; GET returns 503 for real database errors (instead of silently resetting a saved locale to English). Do not falsely claim cross-device persistence.
- HTML `lang` updates on client hydration in the app. The shared Next.js root HTML may initially emit `lang=en` to avoid breaking marketing SSR and existing routes. Full SSR user-specific locale would require a route-segment/server refactor, not part of this release.

## Required release order
1. Run automated TypeScript, Next.js production build, Capacitor/Vite native bundle build, catalog, mobile shell compatibility, API persistence and existing preferences tests.
2. Apply `supabase/migrations/20261115120000_user_interface_locale.sql` to **staging** and verify `user_settings.locale` column/constraint.
3. Browser and Android device QA with two real accounts and English/Turkish. Verify language persistence after reload, account switch and cross-device sign-in; exercise native Settings → Appearance as well as web Settings → Appearance, and verify private data unchanged.
4. **Before production deployment**, explicitly approve and apply migration to Production. If new API is published before migration, language switching can fail.
5. Deploy the matching commit to Vercel Production manually, keeping Git auto-deploy disabled.

## Coverage and limitations
- A single central catalog currently contains over 900 curated EN→TR source text mappings and covers shell navigation, settings, onboarding, boards, Actions, Planner, Analytics, billing, notifications, collaboration and AI-interface controls. Business logic and paid pricing are unchanged.
- Template-based Process stage titles are localized **at creation only** when selected from the starter catalog. Existing, user-edited, or saved Process/Action fields are never retroactively translated.
- Relevant date and relative-time rendering now follows the active locale in Dashboard, Planner, Analytics and notification bell.
- This change does not promise perfect translation of thousands of dynamic API error strings, AI-generated responses, third-party payment pages, or all rich editor interactions.
- Maintain a visible-strings audit and manual screen-by-screen acceptance list before calling the entire app 100% localized.
- Marketing EN/TR continues using its existing per-route SEO-aware implementation. An eventual shared global catalog would reduce duplication.


## Translation acceptance matrix (manual release requirement)

Use **two real accounts** (one EN and one TR), at least one workspace member,
and verify across desktop (1440px), tablet (768px) and mobile (375px):
- Settings → Appearance → EN/TR; refresh and log into another device; confirm persistence.
- Main navigation, header, mobile user menu, search palette, selected-team navigation.
- New Action + Process modal, custom property editors, Board stage switching,
  List view filters, Action details, Notes/Checklists, file upload UI.
- Dashboard, Planner Today/upcoming/recurrence, Analytics, Achievements, Notifications.
- Settings Account, Profile, Workspace, Members, Organization, Calendar,
  Notification preferences and Billing.
- AI conversation management, permissions, proposal confirmation and error states.
- Error/success toast paths (network failure, forbidden action, empty list), loading,
  fallback text, accessible labels, tablet overflow and truncation.
- Verify user-entered task text, Note content, Customer data and generated AI text
  remain exactly as saved; switching UI language does not mutate persisted objects.
- Test a new TR Process template: stages should be seeded in Turkish. Reopen a
  previously authored EN Process: stage names must remain as originally stored.

**No 100% completion claim without this matrix and screenshot-assisted review.**
The source catalog is a localization foundation, not evidence that every dynamic
server error, third-party page and infrequently used editor dialog is translated.

## Known acceptance gaps (do not claim 100% yet)
- Remaining native-only planner, deeper Knowledge Hub and rich-editor strings need a screen-by-screen English/Turkish visual QA pass, even though the shared React layer now receives the locale.
- Native bundle CI is the first functional build gate, **not** proof of a successful APK install or Android user journey; Android device tests remain necessary.
- Unknown server-provided, third-party, AI-generated and user-authored strings remain unchanged; source-key lookup deliberately falls back to English for unknown static copy. Do not treat catalog size as a percent translated.
- Root server HTML initially renders `lang=en` even for users preferring Turkish; app updates `document.documentElement.lang` on hydration. Full SSR user-specific language requires a deliberate server-side refactor.
- The migration must be deployed to staging before cross-device locale tests, and to production only after explicit release approval. Git automatic deploy remains disabled.

## 15-November screenshot QA — mixed EN/TR regression matrix

The provided authenticated Turkish-language QA screenshots exposed previously hardcoded English text. These areas are now explicitly part of localization coverage:

| Flow | Required Turkish behavior | Preserved user-controlled content |
|---|---|---|
| Dashboard / My Day | Hero, capture, headings, date labels, dynamic totals and overdue labels | Team and action titles |
| Projects / Board | Breadcrumb, intro, stage counters, Action cards, priority and UI actions | Process and custom column names |
| Planner | Main title, tab descriptions, Quick Capture controls, empty states, dates, schedule toasts | Action and checklist content |
| List view | Table title, field names, sort/filter options, priorities and counts | Custom properties, values and task titles |
| Knowledge Hub | Intro, buttons, tabs, search, empty states, results, dates and descriptions | Notes and checklist content |
| Customers | Page description, search, empty states and counts | Configurable customer directory labels and client names |
| Integrations | Webhook description, event labels, alerts, forms, dialogs, logs, secrets and success messages | Webhook names, event codes, URLs and secrets |
| Analytics | KPI descriptions, metric headings, priority names and dynamic insights | Process names |
| Achievements | Achievement names, descriptions, categories and progress text | None |
| Settings | Profile, notifications, calendar, members, organization and AI usage card | Account, organization and user names |
| Billing | Plan cards, included features, quotas, intervals and subscription actions | Plan IDs, verified amounts and provider responses |

The string contract `scripts/test-app-i18n.ts` now covers these feature components and includes screenshot-specific regression assertions. Static-string coverage is **not** equivalent to full translated-screen coverage, and live app testing with real accounts remains required.

### Manual acceptance before marking P2.1 complete
- Check **EN** and **TR** after reload and after switching between two accounts on the same browser. The previous account's cached preference must not leak.
- On desktop and mobile widths, open Dashboard, Board, Planner (Today / Calendar / Routines), List, Knowledge Hub, Customers, Integrations, Analytics, Achievements and every Settings section. Confirm all *product-owned* visible strings, tooltips, alerts, placeholders, menus and dates use the selected locale.
- Create a process, Action, checklist, Note, customer and reminder while Turkish is active. Confirm user-entered text and stored IDs remain unchanged and no feature gate or API request semantics are altered.
- Verify pending states, permissions, empty states, API/network failures, notifications, webhook dialogs, plan selection and subscription details in both locales. Keep payment-provider-hosted pages out of the app translation guarantee.
- Android native entry requires a fresh Vite build and on-device smoke testing; passing the web Next.js build alone is insufficient.
- Staging database migration is mandatory for persistence testing. The already-applied production migration must **not** be run twice unnecessarily. This PR must not be merged or deployed while CI is red.
