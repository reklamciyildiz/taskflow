import { supabaseAdmin } from '@/lib/supabase-admin';
import { decryptString } from '@/lib/crypto-app';
import { deleteEvent, isGoogleInvalidGrantError, upsertAllDayTaskEvent, upsertTimedTaskEvent } from '@/lib/google-calendar';
import { getPublicAppUrl } from '@/lib/app-url';

type TaskLike = {
  id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
};

function isDateOnlyYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function isLegacyUtcMidnightIso(s: string): boolean {
  // Legacy UI used `toISOString()` even for date-only picks, producing midnight UTC.
  // Treat these as date-only to avoid "03:00–04:00" (or similar) time shifts.
  const t = s.trim();
  return /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.\d{1,9})?(?:Z|[+-]00:00)$/.test(t);
}

function formatYmdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !d) return date.toISOString().slice(0, 10);
  return `${y}-${m}-${d}`;
}

function formatRfc3339InTimeZone(date: Date, timeZone: string): string {
  // Use Intl parts to build an offset datetime string acceptable by Google Calendar API.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'shortOffset',
  });
  const parts = dtf.formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value;

  const yyyy = get('year');
  const mm = get('month');
  const dd = get('day');
  const HH = get('hour');
  const MM = get('minute');
  const SS = get('second');
  const tzName = get('timeZoneName'); // e.g. GMT+3

  if (!yyyy || !mm || !dd || !HH || !MM || !SS || !tzName) {
    // Fallback: ISO string (UTC)
    return date.toISOString();
  }

  const m = tzName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/i);
  if (!m) return date.toISOString();
  const sign = m[1].startsWith('-') ? '-' : '+';
  const hours = String(Math.abs(Number(m[1]))).padStart(2, '0');
  const minutes = String(Number(m[2] ?? 0)).padStart(2, '0');
  const offset = `${sign}${hours}:${minutes}`;
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}${offset}`;
}

async function getUserTimeZone(userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('user_settings').select('time_zone').eq('user_id', userId).maybeSingle();
  const tz = (data as any)?.time_zone as string | undefined;
  if (tz && tz.trim().length > 0) return tz.trim();
  return 'UTC';
}

async function getGoogleConnection(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('refresh_token_enc, selected_calendar_id, sync_enabled, revoked_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  if ((data as any).revoked_at) return null;
  if ((data as any).sync_enabled === false) return null;
  const enc = (data as any).refresh_token_enc as string | undefined;
  const calendarId = (data as any).selected_calendar_id as string | null | undefined;
  if (!enc || !calendarId) return null;
  try {
    const refreshToken = decryptString(enc);
    return { refreshToken, calendarId };
  } catch {
    return null;
  }
}

async function getDecryptedRefreshToken(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('refresh_token_enc, revoked_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  if ((data as any).revoked_at) return null;
  const enc = (data as any).refresh_token_enc as string | undefined;
  if (!enc) return null;
  try {
    return decryptString(enc);
  } catch {
    return null;
  }
}

async function getEventLink(userId: string, taskId: string) {
  const { data } = await supabaseAdmin
    .from('google_calendar_event_links')
    .select('google_event_id, calendar_id')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .maybeSingle();
  return data as any | null;
}

async function deleteLinkAndEvent(userId: string, taskId: string) {
  const link = await getEventLink(userId, taskId);
  if (!link?.google_event_id || !link?.calendar_id) {
    await supabaseAdmin.from('google_calendar_event_links').delete().eq('user_id', userId).eq('task_id', taskId);
    return;
  }
  const refresh = await getDecryptedRefreshToken(userId);
  if (refresh) {
    try {
      await deleteEvent(refresh, link.calendar_id, link.google_event_id);
    } catch (e) {
      if (isGoogleInvalidGrantError(e)) {
        await supabaseAdmin
          .from('google_calendar_connections')
          .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      }
    }
  }
  await supabaseAdmin.from('google_calendar_event_links').delete().eq('user_id', userId).eq('task_id', taskId);
}

export async function syncGoogleCalendarForUserTask(args: { userId: string; task: TaskLike }) {
  try {
    const conn = await getGoogleConnection(args.userId);
    if (!conn) return;

    const due = args.task.due_date;
    if (!due) {
      await deleteLinkAndEvent(args.userId, args.task.id);
      return;
    }

    const tz = await getUserTimeZone(args.userId);
    const appUrl = getPublicAppUrl();

    const dueStr = String(due);
    const parsed = new Date(dueStr);
    if (Number.isNaN(parsed.getTime())) {
      await deleteLinkAndEvent(args.userId, args.task.id);
      return;
    }

    const existing = await getEventLink(args.userId, args.task.id);
    const eventId = existing?.google_event_id as string | undefined;

    let result: { id: string; etag: string | null };

    if (isDateOnlyYmd(dueStr) || isLegacyUtcMidnightIso(dueStr)) {
      // Date-only semantics.
      // - If stored as `YYYY-MM-DD`, use it literally.
      // - If stored as legacy midnight-UTC ISO, convert to the user's calendar day.
      const ymd = isDateOnlyYmd(dueStr) ? dueStr.trim() : formatYmdInTimeZone(parsed, tz);
      result = await upsertAllDayTaskEvent({
        refreshToken: conn.refreshToken,
        calendarId: conn.calendarId,
        eventId,
        title: args.task.title,
        description: args.task.description ?? '',
        dueYmd: ymd,
        appUrl,
        taskId: args.task.id,
      });
    } else {
      const start = formatRfc3339InTimeZone(parsed, tz);
      const endDt = new Date(parsed.getTime() + 60 * 60 * 1000);
      const end = formatRfc3339InTimeZone(endDt, tz);
      result = await upsertTimedTaskEvent({
        refreshToken: conn.refreshToken,
        calendarId: conn.calendarId,
        eventId,
        title: args.task.title,
        description: args.task.description ?? '',
        start: { dateTime: start, timeZone: tz },
        end: { dateTime: end, timeZone: tz },
        appUrl,
        taskId: args.task.id,
      });
    }

    await supabaseAdmin.from('google_calendar_event_links').upsert(
      {
        user_id: args.userId,
        task_id: args.task.id,
        calendar_id: conn.calendarId,
        google_event_id: result.id,
        etag: result.etag,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,task_id' }
    );
  } catch (e) {
    if (isGoogleInvalidGrantError(e)) {
      await supabaseAdmin
        .from('google_calendar_connections')
        .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', args.userId);
      return;
    }
    console.error('Google Calendar sync failed:', e);
  }
}

export async function syncGoogleCalendarForTaskForRelevantUsers(args: { actorUserId: string; assigneeId?: string | null; task: TaskLike }) {
  const ids = new Set<string>();
  ids.add(args.actorUserId);
  if (args.assigneeId) ids.add(args.assigneeId);

  await Promise.allSettled(Array.from(ids).map((id) => syncGoogleCalendarForUserTask({ userId: id, task: args.task })));
}

export async function removeGoogleCalendarForUserTask(args: { userId: string; taskId: string }) {
  try {
    await deleteLinkAndEvent(args.userId, args.taskId);
  } catch (e) {
    console.error('Google Calendar remove failed:', e);
  }
}

export async function deleteGoogleCalendarEventsForTaskEverywhere(taskId: string) {
  try {
    const { data: links, error } = await supabaseAdmin
      .from('google_calendar_event_links')
      .select('user_id, calendar_id, google_event_id')
      .eq('task_id', taskId);
    if (error) return;
    for (const row of links ?? []) {
      const userId = (row as any).user_id as string;
      const refresh = await getDecryptedRefreshToken(userId);
      if (!refresh) continue;
      try {
        await deleteEvent(refresh, (row as any).calendar_id, (row as any).google_event_id);
      } catch {
        // ignore
      }
    }
    await supabaseAdmin.from('google_calendar_event_links').delete().eq('task_id', taskId);
  } catch (e) {
    console.error('Google Calendar delete failed:', e);
  }
}
