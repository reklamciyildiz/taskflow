# Reminders & cron (production)

Axiom has **two notification mechanisms**, both sourced from canonical `work_schedules`:

1. **Explicit reminders** — reminder rules are resolved to absolute instants for the relevant one-off or recurring occurrence. Processed by `processScheduledReminders()` (needs **frequent** ticks; deduped in DB).
2. **Due-date buckets** — overdue / due today / due tomorrow for one-off Action and Checklist schedules, evaluated in the recipient's saved IANA time zone. Processed by `processTaskDueReminders()` (deduped; safe on the same cadence).

Saving a schedule does **not** immediately notify the user. A notification is created when an explicit reminder becomes due, or when a one-off schedule enters a due-date bucket on a cron tick.

## Unified endpoint (single URL)

**`GET /api/cron/reminders-tick`** runs **both** processors in one call. Point **one** external scheduler (or Vercel Cron on Pro) at this path.

### Auth (required for external callers)

Implementation: `lib/cron-reminders-guard.ts`.

- Set **`CRON_SECRET`** on Vercel (Production). Callers must send:
  - Header: `Authorization: Bearer <CRON_SECRET>` (exactly `Bearer` + one space + secret).
- If **`CRON_SECRET` is unset** in production, only Vercel Cron (`User-Agent: vercel-cron/1.0`) may invoke the route — **cron-job.org / curl will get 401** until you set the secret.

---

## Recommended: external HTTP cron (free, predictable interval)

GitHub Actions `schedule` is **best-effort**; short intervals (e.g. `*/10`) often run **much less frequently** in practice. For “5 minutes before” style reminders, use a **dedicated HTTP cron** service.

### Option A — [cron-job.org](https://cron-job.org/en/) (typical free choice)

1. Vercel → Project → Settings → Environment Variables → **Production**: set **`CRON_SECRET`** to a long random value (32+ bytes). Redeploy if needed.
2. Create an account at [cron-job.org](https://cron-job.org/).
3. **Create cronjob**:
   - **URL**: `https://<your-production-host>/api/cron/reminders-tick`
   - **Method**: `GET`
   - **Schedule**: every **10** minutes (or **5** for tighter absolute-reminder delivery).
   - **Headers**: add  
     `Authorization` = `Bearer <same CRON_SECRET as Vercel>`
4. Save and use **Test now** (or wait for first run). Expect HTTP **200** and JSON `{ "ok": true, "stats": { ... } }`.
5. Enable **failure notifications** (email) in cron-job.org so a broken secret or 5xx does not go unnoticed.

**Operational notes**

- Do **not** commit `CRON_SECRET` to git. Rotate by updating Vercel + cron-job.org together.
- Overlapping triggers (Vercel daily + cron-job.org + GitHub) are **OK**: notification dedupe reduces duplicate user alerts; you still pay a few extra server invocations.

### Option B — Vercel Cron (Pro)

On **Pro**, set `vercel.json` to a single high-frequency cron (e.g. every 5–10 minutes) on `/api/cron/reminders-tick`. See Vercel cron docs for plan limits.

### Option C — GitHub Actions (optional backup only)

Workflow: `.github/workflows/scheduled-reminders-cron.yml`. Treat as **backup** or **disabled** once cron-job.org is verified — do not rely on it for strict 10-minute SLA.

---

## Vercel Hobby (current repo default)

- **`vercel.json`**: two **daily** triggers on `reminders-tick` (08:00 and 20:00 UTC) as a **safety net** when external cron/GitHub are down.
- **Primary frequent ticking**: cron-job.org (or Pro Vercel cron), not Hobby Vercel alone.

---

## Legacy routes (still supported)

- `GET /api/cron/scheduled-reminders` — absolute only  
- `GET /api/cron/reminders` — due-date buckets only  

Prefer **`reminders-tick`** so operators only maintain **one** URL.

---

## Behaviour notes

- Explicit reminders fire when their resolved instant is at or before `now` and within the processor **lookback** window (default 24h). A recurring schedule resolves only the requested occurrence window; it does not materialize an infinite reminder array.
- Due-date reminders use the recipient's saved IANA time zone. Due-today and first-overdue alerts become eligible at 09:00 local time; due-tomorrow alerts at 18:00 local time. The Schedule UI captures the browser time zone only when the user has no saved preference; it never overwrites an explicit Calendar setting.
- If the user configured an explicit reminder, that policy replaces the generic due-today/due-tomorrow alert so the same work does not notify twice. Overdue protection still applies if the work remains open.
- **Overdue** (Action + Checklist): at most **two** notifications per unchanged schedule — first at 09:00 on the first overdue calendar day in the recipient's zone, second 48 hours later. No further overdue reminders are sent unless the schedule is changed.
- Completed Checklist items and Actions in terminal Process stages are excluded. Recipient order is Checklist assignee → Action assignee → creator.
- In-app notification rows are created even when browser push is disabled. Web push additionally requires VAPID configuration, the user's Push setting, browser permission, and an active subscription.
- **DB**: `notifications` has a **partial unique index** on `(user_id, type, link)` where `link` is set (`20260504120000_notifications_unique_user_type_link.sql`) so concurrent cron ticks cannot insert duplicates. In-app rows use the **dedupe** URL as `link` (still opens the board); push payloads use the clean board URL.
