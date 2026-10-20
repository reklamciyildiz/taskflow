import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const readEnv = (path) => existsSync(path) ? parse(readFileSync(path)) : {};
const projectRef = (url) => /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url ?? '')?.[1] ?? null;
const staging = readEnv('.env.staging.local');
const production = readEnv('.env.local');

if (!staging.AXIOM_STAGING_DATABASE_URL) throw new Error('Staging database URL is missing');
if (!staging.AXIOM_STAGING_SUPABASE_PROJECT_REF) throw new Error('Staging project guard is missing');
if (projectRef(staging.NEXT_PUBLIC_SUPABASE_URL) !== staging.AXIOM_STAGING_SUPABASE_PROJECT_REF) {
  throw new Error('Staging project identity mismatch');
}
if (projectRef(staging.NEXT_PUBLIC_SUPABASE_URL) === projectRef(production.NEXT_PUBLIC_SUPABASE_URL)) {
  throw new Error('Refusing to test against production');
}

const client = new Client({ connectionString: staging.AXIOM_STAGING_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
let rolledBack = false;
try {
  await client.query('BEGIN');
  const schema = await client.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'work_schedules' AND column_name = 'duration_minutes'
      ) AS duration_column,
      EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.work_schedules'::regclass
          AND conname = 'work_schedules_duration_minutes_check'
      ) AS duration_constraint
  `);
  if (!schema.rows[0]?.duration_column || !schema.rows[0]?.duration_constraint) {
    throw new Error('Planner duration schema is incomplete');
  }

  let schedule = await client.query(`
    SELECT id
    FROM public.work_schedules
    WHERE archived_at IS NULL AND schedule_time IS NOT NULL
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE
  `);
  if (!schedule.rowCount) {
    const task = await client.query(`
      SELECT t.id, t.organization_id, t.team_id
      FROM public.tasks t
      WHERE NOT EXISTS (
        SELECT 1 FROM public.work_schedules ws
        WHERE ws.task_id = t.id AND ws.checklist_item_id IS NULL AND ws.archived_at IS NULL
      )
      ORDER BY t.created_at
      LIMIT 1
      FOR UPDATE
    `);
    if (!task.rowCount) throw new Error('No safe staging Action is available for the rollback-only test');
    const source = task.rows[0];
    schedule = await client.query(`
      INSERT INTO public.work_schedules (
        organization_id, team_id, task_id, schedule_type, schedule_date,
        schedule_time, time_zone, duration_minutes
      ) VALUES ($1, $2, $3, 'one_off', CURRENT_DATE + 7, '10:00', 'Europe/Istanbul', 45)
      RETURNING id
    `, [source.organization_id, source.team_id, source.id]);
  } else {
    await client.query('UPDATE public.work_schedules SET duration_minutes = 45 WHERE id = $1', [schedule.rows[0].id]);
  }

  const stored = await client.query('SELECT duration_minutes FROM public.work_schedules WHERE id = $1', [schedule.rows[0].id]);
  if (stored.rows[0]?.duration_minutes !== 45) throw new Error('Duration did not round-trip');

  await client.query('SAVEPOINT invalid_duration');
  let invalidRejected = false;
  try {
    await client.query(`
      UPDATE public.work_schedules
      SET schedule_time = NULL, time_zone = NULL, duration_minutes = 30
      WHERE id = $1
    `, [schedule.rows[0].id]);
  } catch (error) {
    invalidRejected = error?.code === '23514';
  }
  await client.query('ROLLBACK TO SAVEPOINT invalid_duration');
  if (!invalidRejected) throw new Error('Invalid all-day duration was not rejected');

  await client.query('ROLLBACK');
  rolledBack = true;
  console.log(JSON.stringify({
    stagingProjectVerified: true,
    durationColumn: true,
    durationConstraint: true,
    timedDurationRoundTrip: true,
    invalidAllDayDurationRejected: true,
    writesPersisted: false,
  }));
} finally {
  if (!rolledBack) await client.query('ROLLBACK').catch(() => undefined);
  await client.end();
}
