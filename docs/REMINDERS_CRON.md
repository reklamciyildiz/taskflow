# Reminders & cron (production)

Axiom has **two reminder mechanisms**:

1. **Absolute reminders** — ISO timestamps in `tasks.reminders` and optional `journal_logs[*].reminders` (e.g. “5 mins before due”). Processed by `processScheduledReminders()` (needs **frequent** ticks; deduped in DB).
2. **Due-date buckets** — UTC calendar day: overdue / due today / due tomorrow for task due dates and checklist row due dates. Processed by `processTaskDueReminders()` (deduped; safe on the same cadence).

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

- Absolute reminders fire when `reminder_time <= now` and within the processor **lookback** window (default 24h), with notification dedupe — they are **not** deleted from the task row after firing (v1).
- Due-date reminders use **UTC dates**; “due today” is a **day** concept, not “1 hour before”.
