'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import { toast } from 'sonner';

async function saveTimeZoneSetting(tz: string) {
  const saved = localStorage.getItem('taskflow-settings');
  const settings = saved ? JSON.parse(saved) : {};
  settings.time_zone = tz;
  localStorage.setItem('taskflow-settings', JSON.stringify(settings));
  try {
    await fetch('/api/users/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time_zone: tz }),
    });
  } catch { /* best-effort */ }
}

export function CalendarSettings() {
  const [mounted, setMounted] = useState(false);
  const [timeZone, setTimeZone] = useState('UTC');
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleSelectedCalendarId, setGoogleSelectedCalendarId] = useState('primary');
  const [googleSyncEnabled, setGoogleSyncEnabled] = useState(true);
  const [googleCalendars, setGoogleCalendars] = useState<Array<{ id: string; summary: string; primary: boolean }>>([]);
  const [googleCalendarsLoading, setGoogleCalendarsLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const browserTimeZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  }, []);

  const timeZoneOptions = useMemo(() => {
    try {
      const i = Intl as any;
      if (typeof i.supportedValuesOf === 'function') {
        return [...(i.supportedValuesOf('timeZone') as string[])].sort((a, b) => a.localeCompare(b));
      }
    } catch { /* ignore */ }
    return [
      'UTC', 'Europe/Istanbul', 'Europe/London', 'Europe/Berlin', 'Europe/Paris',
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Sao_Paulo', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore',
      'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney',
    ];
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/google/status');
      const json = await res.json();
      if (!json?.success) return;
      const d = json.data;
      if (!d?.connected) {
        setGoogleConnected(false);
        setGoogleEmail(null);
        setGoogleCalendars([]);
        return;
      }
      setGoogleConnected(true);
      setGoogleEmail(d.email ?? null);
      setGoogleSelectedCalendarId(d.selectedCalendarId || 'primary');
      setGoogleSyncEnabled(d.syncEnabled !== false);
    } catch { /* ignore */ }
  }, []);

  const loadGoogleCalendars = useCallback(async () => {
    setGoogleCalendarsLoading(true);
    try {
      const res = await fetch('/api/integrations/google/calendars');
      const json = await res.json();
      if (!json?.success) {
        setGoogleCalendars([]);
        if (res.status === 401 && json?.code === 'google_reauth_required') {
          setGoogleConnected(false);
          setGoogleEmail(null);
          toast.error('Google connection expired. Please reconnect Google Calendar.');
          void loadGoogleStatus();
          return;
        }
        if (typeof json?.error === 'string' && json.error.length > 0) toast.error(json.error);
        return;
      }
      setGoogleCalendars(json.data?.calendars ?? []);
    } catch {
      setGoogleCalendars([]);
      toast.error('Could not load Google calendars.');
    } finally {
      setGoogleCalendarsLoading(false);
    }
  }, [loadGoogleStatus]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const load = async () => {
      try {
        const res = await fetch('/api/users/settings');
        const data = await res.json();
        if (data.success && data.data) {
          const src = data.meta?.source as 'db' | 'default' | undefined;
          if (src === 'default') {
            const saved = localStorage.getItem('taskflow-settings');
            if (saved) {
              const s = JSON.parse(saved);
              setTimeZone(s.time_zone ?? s.timeZone ?? browserTimeZone);
              return;
            }
          }
          setTimeZone(data.data.time_zone || browserTimeZone);
        }
      } catch {
        const saved = localStorage.getItem('taskflow-settings');
        if (saved) {
          const s = JSON.parse(saved);
          setTimeZone(s.time_zone ?? s.timeZone ?? browserTimeZone);
        }
      }
    };
    void load();
    void loadGoogleStatus();
  }, [mounted, browserTimeZone, loadGoogleStatus]);

  useEffect(() => {
    if (!mounted || !googleConnected) return;
    void loadGoogleCalendars();
  }, [mounted, googleConnected, loadGoogleCalendars]);

  const handleSaveTimeZone = (next: string) => {
    setTimeZone(next);
    void saveTimeZoneSetting(next);
  };

  const handleGoogleConnect = () => {
    window.location.href = '/api/integrations/google/start';
  };

  const handleGoogleDisconnect = async () => {
    setGoogleBusy(true);
    try {
      const res = await fetch('/api/integrations/google/disconnect', { method: 'POST' });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || 'Disconnect failed');
      toast.success('Google Calendar disconnected');
      setGoogleConnected(false);
      setGoogleEmail(null);
      setGoogleCalendars([]);
    } catch (e: any) {
      toast.error(e?.message || 'Disconnect failed');
    } finally {
      setGoogleBusy(false);
    }
  };

  const patchGoogleConnection = async (patch: { selectedCalendarId?: string; syncEnabled?: boolean }) => {
    setGoogleBusy(true);
    try {
      const res = await fetch('/api/integrations/google/connection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || 'Update failed');
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleCalendarChange = async (calendarId: string) => {
    setGoogleSelectedCalendarId(calendarId);
    await patchGoogleConnection({ selectedCalendarId: calendarId });
    toast.success('Calendar selection saved');
  };

  const handleSyncToggle = async (checked: boolean) => {
    setGoogleSyncEnabled(checked);
    await patchGoogleConnection({ syncEnabled: checked });
    toast.success(checked ? 'Calendar sync enabled' : 'Calendar sync paused');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Time zone and calendar integrations.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            Time zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Date-only due dates are interpreted as calendar days in this time zone.
          </p>
          <Select value={timeZone} onValueChange={handleSaveTimeZone}>
            <SelectTrigger className="bg-white dark:bg-gray-800">
              <SelectValue placeholder="Select a time zone" />
            </SelectTrigger>
            <SelectContent className="max-h-[320px] overflow-y-auto">
              {timeZoneOptions.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Detected from browser: {browserTimeZone}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Google Calendar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Sync due dates to a calendar you choose. Each teammate uses their own Google account and time zone.
          </p>
          <Separator />

          {!googleConnected ? (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">Not connected</p>
              <Button type="button" onClick={handleGoogleConnect} disabled={googleBusy}>
                Connect Google
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                <div className="text-xs text-muted-foreground">Connected as</div>
                <div className="font-medium">{googleEmail || 'Google account'}</div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Sync due dates</Label>
                  <p className="text-xs text-muted-foreground">Pause without disconnecting Google</p>
                </div>
                <Switch
                  checked={googleSyncEnabled}
                  onCheckedChange={(v) => void handleSyncToggle(v)}
                  disabled={googleBusy}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Destination calendar</Label>
                <Select
                  value={googleSelectedCalendarId}
                  onValueChange={(v) => void handleCalendarChange(v)}
                  disabled={googleBusy || googleCalendarsLoading || !googleSyncEnabled}
                >
                  <SelectTrigger className="bg-white dark:bg-gray-800">
                    <SelectValue
                      placeholder={googleCalendarsLoading ? 'Loading calendars…' : 'Select a calendar'}
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px] overflow-y-auto">
                    {(googleCalendars.length
                      ? googleCalendars
                      : [{ id: 'primary', summary: 'Primary', primary: true }]
                    ).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.summary}{c.primary ? ' (primary)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!googleSyncEnabled && (
                  <p className="text-xs text-muted-foreground">Turn sync on to update Google Calendar events.</p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadGoogleCalendars()}
                  disabled={googleBusy || googleCalendarsLoading}
                >
                  Refresh calendars
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void handleGoogleDisconnect()}
                  disabled={googleBusy}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
