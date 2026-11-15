# Actiproc P2.1 — Centralized application localization (EN/TR)

## Implemented architecture
- Authenticated app only: `AppLocaleProvider` resides in `ShellProviders`, separate from SEO-enabled marketing locales.
- Central source-string dictionary `lib/i18n/catalog.ts` and pure formatters in `lib/i18n/app-locale.ts`. Add future languages by extending `APP_LOCALES`, catalog, locale validation and DB check constraint together.
- English is the default. Turkish selected through Settings → Appearance or the Header / mobile user menu. No translation service calls or AI model cost.
- Translation happens at component render, not via DOM text mutation. This preserves React event handlers and avoids overwriting user-generated text.
- The user's own Action titles, Process names, Notes, comments, customer names, email content and AI responses are **not** automatically translated.
- Dates, numbers and currency can be locale-formatted using `useAppLocale().date / number / money`.
- Per-user preference is stored in `user_settings.locale`. The browser cache is used for fast UI startup and refreshed from server; settings API only accepts `en` or `tr`, tied to authenticated user's id.
- Updates show errors and revert optimistic state when DB writes fail; do not falsely claim cross-device persistence.
- HTML `lang` updates on client hydration in the app. The shared Next.js root HTML may initially emit `lang=en` to avoid breaking marketing SSR and existing routes. Full SSR user-specific locale would require a route-segment/server refactor, not part of this release.

## Required release order
1. Run automated TypeScript, build, catalog, API persistence and existing preferences tests.
2. Apply `supabase/migrations/20261115120000_user_interface_locale.sql` to **staging** and verify `user_settings.locale` column/constraint.
3. Browser QA with two real accounts and English/Turkish, desktop and Android/PWA; verify preference persists after reload and on another device; check private data unchanged.
4. **Before production deployment**, explicitly approve and apply migration to Production. If new API is published before migration, language switching can fail.
5. Deploy the matching commit to Vercel Production manually, keeping Git auto-deploy disabled.

## Coverage and limitations
- A single central catalog covers common terminology and shell navigation, settings, critical onboarding, boards, Actions, Planner, Analytics, billing, notifications and collaboration controls.
- This change does not promise perfect translation of thousands of dynamic API error strings, AI-generated responses, third-party payment pages, or all rich editor interactions.
- Maintain a visible-strings audit and manual screen-by-screen acceptance list before calling the entire app 100% localized.
- Marketing EN/TR continues using its existing per-route SEO-aware implementation. An eventual shared global catalog would reduce duplication.
