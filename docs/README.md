# Actiproc — Technical documentation

This is the documentation map for the [Actiproc repository](../README.md). The current product name is **Actiproc**; some legacy files and identifiers still use **Axiom**.

> **Reading policy:** Many documents are dated implementation notes or release *plans*. A successful PR, committed migration, or passing CI run does not prove that a feature, SQL change, or third-party integration is enabled in Production. Prefer current source/configuration and verified deployment evidence over historical status text.

## Start here

| Resource | Use it for |
| --- | --- |
| [Main README](../README.md) | Product scope, architecture, local setup, tests, deployment process |
| [Environment template](../.env.example) | Development and server-only integration variables |
| [Android client](../mobile/README.md) | Capacitor build targets, device preflight, native security boundaries |
| [Supabase setup](./SUPABASE_SETUP.md) | Historical configuration reference; independently verify current schema |
| [Authentication integration](./NEXTAUTH_SUPABASE_AUTH_INTEGRATION.md) | NextAuth/Supabase interoperability context |
| [Authentication 401 QA](./AUTH_CREDENTIALS_401_QA_20261116.md) | Current credentials-login diagnosis and regression strategy |

## Product and architecture

| Resource | Scope |
| --- | --- |
| [Marketing EN/TR](./MARKETING_LOCALES_EN_TR.md) | Localized public landing and routing |
| [Application EN/TR](./P2_APP_LANGUAGE_EN_TR.md) | Signed-in locale foundations and rollout |
| [Inbox across platforms](./INBOX_WEB_ANDROID_IOS_ROLLOUT.md) | Canonical team Inbox and mobile alignment |
| [Connected Notes](./CONNECTED_NOTES_V1_RELEASE.md) | Checklist ↔ Note relationships and constraints |
| [Knowledge Hub](./README_PERSONAL_OS.md) | Historical feature and Personal OS overview |
| [Smart Dependencies foundation](./P23_SMART_DEPENDENCIES_FOUNDATION.md) | Database graph, access and completion invariants |
| [Dependencies UI](./P232_DEPENDENCIES_UI.md) | Responsive controls, hidden blockers, QA |
| [Advanced Reporting](./P31_ADVANCED_REPORTING.md) | Operational KPIs, CSV, data completeness limits |
| [Global Search](./P1_GLOBAL_SEARCH_COMMAND_PALETTE.md) | Search and command palette coverage |
| [Feedback Hub](./FEEDBACK_V1_ROLLOUT.md) | Moderated ideas and feedback workflow |

## Release, quality and integrations

| Resource | Scope |
| --- | --- |
| [Android Connected Notes parity](./ANDROID_CONNECTED_NOTES_PARITY_20261116.md) | Live API/CORS preflight, APK parity and acceptance |
| [Entitlements](./ACTIPROC_PLAN_ENTITLEMENT_MATRIX.md) | Plan capabilities; cross-check prices with live `lib/billing-plans.ts` |
| [Creem launch](./CREEM_LIVE_LAUNCH.md) | Payment-provider launch gates, test/live isolation |
| [AI public rollout](./AI_PUBLIC_PRICING_AND_ROLLOUT.md) | AI enablement, quota, provider and safety boundaries |
| [Reminders and cron](./REMINDERS_CRON.md) | Server scheduling, delivery and environment checks |
| [RLS verification](./RLS_VERIFICATION_CHECKLIST.md) | Tenant isolation and authorization validation |
| [Security recommendations](./SECURITY_RECOMMENDATIONS.md) | Historical security hardening checklist |
| [Webhook API](./WEBHOOK_API_DOCUMENTATION.md) | Integration contract reference |

## Historical or potentially outdated instructions

The documents below can still explain previous decisions, but **are not the canonical release checklist**:

- [Legacy production guide](./README.production.md): includes earlier platform and auto-deployment assumptions. For this repository, Vercel Git auto-deployment is currently **disabled** in [`vercel.json`](../vercel.json); production is deployed manually from the intended GitHub commit.
- [Legacy database migration instructions](./DATABASE_MIGRATION_INSTRUCTIONS.md): concern an older single migration. **Do not execute that SQL, a global `supabase db push`, or a rollback against Production without separate current-schema review.**
- [Development roadmap](./DEVELOPMENT_ROADMAP.md), [AI roadmap](./AI_FEATURES_ROADMAP.md), [RLS roadmap](./RLS_MIGRATION_ROADMAP.md): plans, not verified current availability.

Actual incremental database changes are tracked in [`supabase/migrations/`](../supabase/migrations/). Verify prerequisites, installed objects, staging behavior and rollout authorization before executing any SQL. GitHub merges never automatically install migrations.
