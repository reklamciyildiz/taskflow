<div align="center">

# Actiproc

**From the first idea to finished work — one connected workspace.**

Organize Processes, move Actions forward, plan your time, preserve context, and collaborate without switching between disconnected tools.

[**Product website**](https://www.actiproc.com/marketing) · [**Türkçe tanıtım**](https://www.actiproc.com/marketing/tr) · [**Documentation**](./docs/README.md)

</div>

---

> [!IMPORTANT]
> **Actively developed product.** This repository contains both released functionality and features behind environment, entitlement, or rollout gates. A successful GitHub merge does **not** mean the same code is deployed to Production. Do not treat sample dashboards, AI previews, or historical reporting as proof of live customer activity.

## Overview

Actiproc brings the work lifecycle into one place:

```text
Idea / incoming request
          ↓
     Inbox or Process
          ↓
   Action + checklist ───── Notes / Knowledge Hub
          ↓                        │
   Planner / reminders ←───────────┘
          ↓
   Team execution + reporting
```

**Processes** are configurable workflows with Board and List views. **Actions** are the units of work, with ownership, priority, schedule, checklist items, notes, and dependencies. **Inbox** collects Actions that do not yet belong to a Process; it is not an additional billable Process.

### Product areas

| Area | What the repository implements |
| --- | --- |
| **Processes & Actions** | Configurable workflow stages; Kanban and List views; filtering, search, assignments, checklists, and Action details. |
| **Planner & Inbox** | Scheduled and recurring work, personal planning, team-scoped uncategorized Actions, and reminders. |
| **Notes & Knowledge** | Rich-text notes with TipTap, searchable Knowledge Hub, and explicit links between Action checklist items and their Notes. |
| **Smart Dependencies** | Prerequisite relationships, blocked/ready indicators, and database-backed cycle and completion guards. |
| **Collaboration** | Organizations, teams, roles, Process visibility, invitations, and customer-related work. |
| **Insights & Reporting** | Overview metrics and operational reporting with Process, assignee, and period filters and a scoped CSV export. |
| **AI assistance** | Workspace-aware assistance and configurable read/write tools with permission, quota, and rollout controls. |
| **Feedback & integrations** | An idea/feedback hub, notifications, and integration paths for calendar, webhooks, email, and attachments. |
| **Web & mobile** | Responsive Next.js/PWA experience and a locally bundled Capacitor Android client; iOS work is maintained separately. |

Availability depends on **plan entitlements**, the configured services, and deployment flags. For example, an AI write tool present in source may be disabled in Production. Reporting uses verified completion timestamps where available; it is **not** a complete historical event ledger, and large-team data may be capped. Android feature parity and iOS distribution are not implied by the existence of client code.

## Technology

| Layer | Current implementation |
| --- | --- |
| Web | **Next.js 13.5** (App Router), **React 18**, TypeScript, Tailwind CSS, Radix/shadcn-style UI |
| Identity | **NextAuth v4** with Google OAuth and credentials; scoped server APIs |
| Persistence | **Supabase PostgreSQL**, RLS, SQL migrations and database integrity checks |
| Rich content | **TipTap** editor, checklists and related Notes |
| Mobile | **Capacitor 8**, React/Vite Android bundle, native session and link adapters |
| Services | Vercel, Creem billing, Cloudflare R2 attachments, email/push, and configurable AI providers |

This repository retains some internal `Axiom` identifiers and package names from earlier development. **Actiproc** is the product name; do not infer a separate product or a newer framework version from those legacy identifiers.

## Repository map

```text
app/
  (marketing)/        Public EN/TR landing pages
  (shell)/            Authenticated product routes
  api/                Server-side routes and integration endpoints
components/           Product and marketing React components
lib/                  Authentication, data, policies, billing, AI, i18n
shared/               Cross-platform contracts and reusable product UI
mobile/               Capacitor Android client and gated build targets
ios/                  iOS work (not a claim of release availability)
supabase/migrations/  Reviewed incremental PostgreSQL changes
scripts/              Tests, verification, diagnostics, staging utilities
.github/workflows/    Domain-specific CI and regression checks
docs/                 Technical decisions, operations, QA and rollout notes
```

## Local development

**Prerequisites:** Node.js **22** (used by repository CI), npm, access to an appropriately configured **development/staging Supabase** project, and Google OAuth credentials for Google sign-in. Native Android builds additionally need an Android SDK and configured Java/Gradle toolchain.

From a clone of the repository:

```powershell
cd taskflow
npm ci
Copy-Item .env.example .env.local
```

On macOS/Linux, use `cp .env.example .env.local` instead of `Copy-Item`.

Edit `.env.local` with **development-only** values. The [tracked variable template](./.env.example) documents feature-specific settings. The most relevant starting points are:

| Environment variable | Purpose |
| --- | --- |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Local NextAuth origin and signing secret |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project and browser-safe key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only:** trusted database operations |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth sign-in and related integrations |
| `NEXT_PUBLIC_APP_URL` | Public application origin |

Additional variables are required **only for the services you configure** (AI providers, email, R2, push, Creem, mobile OAuth, cron). Keep credentials in local environment files and the deployment provider's secret settings, not in Git or a mobile `VITE_*` variable. The sample configuration intentionally leaves several production features disabled.

```powershell
npm run dev
```

Open **http://localhost:3000**. Public landing routes are `/marketing` (English) and `/marketing/tr` (Türkçe). Signed-in workspace flows require a working database and authentication configuration; installing packages does **not** provision Supabase.

> [!CAUTION]
> **Database changes are not automatic.** `supabase/migrations/` contains incremental migrations with ordering and prerequisites. Validate the target environment, apply missing migrations in staging first, and review Production migrations separately. Do not rerun historical SQL merely because its file appears in GitHub.

## Verification

The project uses focused regression suites rather than a single command that proves every feature works in Production.

```powershell
# Web type checking and production build
npx tsc --noEmit
npm run build

# Representative product and commercial regressions
npm run test:entitlements
npm run test:creem

# EN/TR landing and Action dependency UI contracts
npx tsx scripts/test-marketing-locale-coverage.ts
npx tsx scripts/test-task-dependencies-ui.ts
```

The [GitHub Actions workflows](./.github/workflows/) also cover domain-specific security, Postgres behavior, Android parity, AI, billing, and browser scenarios. Some checks require containers, test accounts, approved credentials, or a deployed staging environment. Green CI is **necessary but not equivalent to** real-device or live payment acceptance.

### Android (controlled production beta)

The Android client is a **bundled** Vite/React application, not a production `server.url` wrapper around Next.js. Its backend is still the deployed Actiproc API. Build targets are deliberately explicit:

```powershell
npm ci --prefix mobile
npm --prefix mobile run verify:android-production-beta
npm --prefix mobile run android:debug:production-beta
```

The production-beta preflight must validate the actual deployed API/CORS/auth endpoints **before** an APK is built. Do not bypass a failing guard or place server secrets in client bundle settings. See [mobile/README.md](./mobile/README.md) and the [Android Connected Notes rollout](./docs/ANDROID_CONNECTED_NOTES_PARITY_20261116.md) for detailed environments and device acceptance.

## Release process

1. Implement changes through a reviewed **pull request**; run the relevant GitHub Actions tests.
2. Merge validated code into **`main`**. Local developers update with `git pull --ff-only origin main`.
3. If the release requires SQL, verify which migrations are **actually installed** in the target Supabase database; apply only approved changes **before** dependent backend code.
4. Create a **new Vercel Production deployment from the latest intended GitHub commit**, using the Vercel dashboard. Confirm the deployed source SHA.
5. Smoke-test authentication, tenant access, affected user flows, external services, and (when applicable) the Android API preflight.

**Git-driven automatic deployments are disabled by design** in [`vercel.json`](./vercel.json) (`git.deploymentEnabled=false`). Pushing to GitHub and pulling locally do **not** publish the site. Redeploying an older Vercel build is not a substitute for selecting the latest commit. **No local Vercel CLI command is required** in this project's normal release workflow.

## Security and operational boundaries

- NextAuth sessions and mobile bearer authentication use different client transports; authorization remains a **server responsibility**.
- Data access is scoped by organization, team, role, and Process visibility. PostgreSQL **RLS and integrity rules** complement — not replace — API permission checks.
- **Supabase service-role keys, billing/webhook secrets, AI provider tokens, and attachment credentials** are server-only.
- AI tools, payment acceptance, and production mobile capabilities remain subject to explicit enablement and acceptance checks.
- Public product walkthroughs use **illustrative sample data**, not real users' private workspaces.
- Do not treat a local build, migration existence check, or green CI job as independent evidence of a successful Production rollout.

## Documentation

Start at the [documentation index](./docs/README.md). Particularly useful references:

- [Mobile development & build safety](./mobile/README.md)
- [Authentication and credentials reliability](./docs/AUTH_CREDENTIALS_401_QA_20261116.md)
- [Dependencies: database guarantees](./docs/P23_SMART_DEPENDENCIES_FOUNDATION.md) and [UI contract](./docs/P232_DEPENDENCIES_UI.md)
- [Connected checklist Notes](./docs/CONNECTED_NOTES_V1_RELEASE.md)
- [Operational reporting limitations](./docs/P31_ADVANCED_REPORTING.md)
- [Marketing English/Türkçe](./docs/MARKETING_LOCALES_EN_TR.md)
- [Plans and feature entitlements](./docs/ACTIPROC_PLAN_ENTITLEMENT_MATRIX.md)

Some documents record **historical rollout plans**, not current Production state. Where a document conflicts with tracked code or verified deployment configuration, investigate rather than assuming the document is current.

<details>
<summary><strong>Türkçe kısa özet</strong></summary>

**Actiproc**, bireylerin ve ekiplerin süreçlerini, görevlerini, planlarını, kontrol listelerini ve notlarını tek çalışma alanında yönetmeleri için geliştiriliyor. Web uygulaması Next.js/React; veritabanı Supabase PostgreSQL; Android uygulaması Capacitor tabanlıdır.

**Yerel başlangıç (PowerShell):** `npm ci`, ardından `Copy-Item .env.example .env.local`; geliştirme ortamı değerlerini doldurduktan sonra `npm run dev` çalıştır.

**Yayın akışı:** Geliştirmeler GitHub PR üzerinden test edilerek `main` dalına alınır. Yerelde `git pull --ff-only origin main` ile güncellenir. Production yayını **Vercel panelinden**, ilgili güncel commit seçilerek **manuel** yapılır. Supabase migration dosyaları ayrıca incelenir; GitHub'a kod göndermek SQL çalıştırmaz.

Ürünün Türkçe tanıtımı: [actiproc.com/marketing/tr](https://www.actiproc.com/marketing/tr). Teknik belgeler: [docs/](./docs/README.md).

</details>
