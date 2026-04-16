import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
  'profile',
] as const;

export function getGoogleOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth is not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI).');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function listCalendars(refreshToken: string) {
  const oauth2 = getGoogleOAuthClient();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  const res = await calendar.calendarList.list({ minAccessRole: 'writer' });
  return (res.data.items ?? [])
    .map((c) => ({
      id: c.id ?? '',
      summary: c.summary ?? c.id ?? 'Calendar',
      primary: Boolean(c.primary),
    }))
    .filter((c) => c.id.length > 0);
}

export async function deleteEvent(refreshToken: string, calendarId: string, eventId: string) {
  const oauth2 = getGoogleOAuthClient();
  oauth2.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  await calendar.events.delete({ calendarId, eventId });
}

export async function upsertAllDayTaskEvent(args: {
  refreshToken: string;
  calendarId: string;
  eventId?: string | null;
  title: string;
  description?: string;
  /** YYYY-MM-DD in the user's selected IANA timezone */
  dueYmd: string;
  /** Deep link shown in event description */
  appUrl: string;
  taskId: string;
}) {
  const oauth2 = getGoogleOAuthClient();
  oauth2.setCredentials({ refresh_token: args.refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  const startDate = args.dueYmd;
  const endDate = addOneDayYmd(startDate);

  const body = {
    summary: args.title,
    description: [
      args.description?.trim() ? args.description.trim() : null,
      `Open in TaskFlow: ${args.appUrl}/board?task=${encodeURIComponent(args.taskId)}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    transparency: 'transparent',
    // For all-day actions we intentionally remind shortly before the day starts.
    // Google anchors all-day reminders to 00:00, so "15 minutes before" becomes 23:45
    // on the previous day in many locales. This is useful as a pre-day heads-up.
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 15 }],
    },
    extendedProperties: {
      private: {
        taskflow_task_id: args.taskId,
      },
    },
    start: { date: startDate },
    end: { date: endDate },
  };

  if (args.eventId) {
    const updated = await calendar.events.patch({
      calendarId: args.calendarId,
      eventId: args.eventId,
      requestBody: body,
    });
    return { id: updated.data.id as string, etag: updated.data.etag ?? null };
  }

  const created = await calendar.events.insert({
    calendarId: args.calendarId,
    requestBody: body,
  });
  return { id: created.data.id as string, etag: created.data.etag ?? null };
}

export async function upsertTimedTaskEvent(args: {
  refreshToken: string;
  calendarId: string;
  eventId?: string | null;
  title: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  appUrl: string;
  taskId: string;
}) {
  const oauth2 = getGoogleOAuthClient();
  oauth2.setCredentials({ refresh_token: args.refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });

  const body = {
    summary: args.title,
    description: [
      args.description?.trim() ? args.description.trim() : null,
      `Open in TaskFlow: ${args.appUrl}/board?task=${encodeURIComponent(args.taskId)}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    transparency: 'transparent',
    extendedProperties: {
      private: {
        taskflow_task_id: args.taskId,
      },
    },
    start: args.start,
    end: args.end,
  };

  if (args.eventId) {
    const updated = await calendar.events.patch({
      calendarId: args.calendarId,
      eventId: args.eventId,
      requestBody: body,
    });
    return { id: updated.data.id as string, etag: updated.data.etag ?? null };
  }

  const created = await calendar.events.insert({
    calendarId: args.calendarId,
    requestBody: body,
  });
  return { id: created.data.id as string, etag: created.data.etag ?? null };
}

function addOneDayYmd(ymd: string): string {
  // ymd is expected YYYY-MM-DD; compute next calendar day in UTC-safe way
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
