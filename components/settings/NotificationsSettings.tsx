'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, Repeat2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { subscribeWebPush, unsubscribeWebPush } from '@/components/push/push-client';

async function saveUserSetting(key: string, value: boolean) {
  const saved = localStorage.getItem('taskflow-settings');
  const settings = saved ? JSON.parse(saved) : {};
  settings[key] = value;
  localStorage.setItem('taskflow-settings', JSON.stringify(settings));
  try {
    await fetch('/api/users/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  } catch { /* best-effort */ }
}

export function NotificationsSettings() {
  const [mounted, setMounted] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [recurrenceAlertsEnabled,setRecurrenceAlertsEnabled] = useState(false);
  const [recurrenceAlertThreshold,setRecurrenceAlertThreshold] = useState<2|3|5>(3);
  const [recurrenceAlertsBusy,setRecurrenceAlertsBusy] = useState(false);
  const [teamActivity, setTeamActivity] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      if (typeof window === 'undefined') return;
      const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      if (!supported) { setPushPermission('unsupported'); return; }
      setPushPermission(Notification.permission);
    } catch { setPushPermission('unsupported'); }
  }, [mounted]);

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
              setEmailNotifications(s.email_notifications ?? s.emailNotifications ?? true);
              setPushNotifications(s.push_notifications ?? s.pushNotifications ?? false);
              setTeamActivity(s.team_activity ?? s.teamActivity ?? false);
              // A local setting must never masquerade as a persisted server opt-in.
              setRecurrenceAlertsEnabled(false);
              setRecurrenceAlertThreshold(3);
              return;
            }
          }
          setEmailNotifications(data.data.email_notifications ?? true);
          setPushNotifications(data.data.push_notifications ?? false);
          setTeamActivity(data.data.team_activity ?? false);
          setRecurrenceAlertsEnabled(data.data.recurrence_missed_alerts_enabled === true);
          const threshold = data.data.recurrence_missed_alert_threshold;
          setRecurrenceAlertThreshold(threshold === 2 || threshold === 5 ? threshold : 3);
        }
      } catch {
        const saved = localStorage.getItem('taskflow-settings');
        if (saved) {
          const s = JSON.parse(saved);
          setEmailNotifications(s.email_notifications ?? s.emailNotifications ?? true);
          setPushNotifications(s.push_notifications ?? s.pushNotifications ?? false);
          setTeamActivity(s.team_activity ?? s.teamActivity ?? false);
        }
      }
    };
    void load();
  }, [mounted]);

  const updateRecurrencePreference = async (field: 'recurrence_missed_alerts_enabled'|'recurrence_missed_alert_threshold',value:boolean|2|3|5) => {
    if(recurrenceAlertsBusy)return;
    const previousEnabled=recurrenceAlertsEnabled;
    const previousThreshold=recurrenceAlertThreshold;
    if(field==='recurrence_missed_alerts_enabled')setRecurrenceAlertsEnabled(value===true);
    else setRecurrenceAlertThreshold(value as 2|3|5);
    setRecurrenceAlertsBusy(true);
    try{
      const response=await fetch('/api/users/settings',{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({[field]:value}),
      });
      const json=await response.json().catch(()=>null);
      if(!response.ok||!json?.success)throw new Error(
        response.status===503 ? 'Recurring alerts are not configured in the database yet.' :
        json?.error||'Could not save recurring reminder settings.',
      );
      toast.success('Recurring reminder preference saved.');
    }catch(cause){
      setRecurrenceAlertsEnabled(previousEnabled);
      setRecurrenceAlertThreshold(previousThreshold);
      toast.error(cause instanceof Error?cause.message:'Could not save preference.');
    }finally{setRecurrenceAlertsBusy(false);}
  };

  const handleEmail = (checked: boolean) => {
    setEmailNotifications(checked);
    void saveUserSetting('email_notifications', checked);
  };

  const handlePush = (checked: boolean) => {
    setPushNotifications(checked);
    void saveUserSetting('push_notifications', checked);
    void (async () => {
      try {
        if (checked) {
          try {
            if (typeof window !== 'undefined' && 'Notification' in window) {
              setPushPermission(Notification.permission);
            }
          } catch { /* ignore */ }
          const sub = await subscribeWebPush();
          if (!sub) {
            setPushNotifications(false);
            void saveUserSetting('push_notifications', false);
            try {
              if (typeof window !== 'undefined' && 'Notification' in window) setPushPermission(Notification.permission);
              else setPushPermission('unsupported');
            } catch { setPushPermission('unsupported'); }
            toast.error('Push notifications are not enabled. Please allow notifications in your browser settings.');
            return;
          }
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          });
          try { setPushPermission(Notification.permission); } catch { /* ignore */ }
        } else {
          const endpoint = await unsubscribeWebPush();
          if (!endpoint) return;
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
          });
        }
      } catch { /* best-effort */ }
    })();
  };

  const handleTeamActivity = (checked: boolean) => {
    setTeamActivity(checked);
    void saveUserSetting('team_activity', checked);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how and when you get notified.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Notification channels
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Email Notifications</Label>
              <p className="text-xs text-muted-foreground">Receive email updates for action assignments</p>
            </div>
            <Switch checked={emailNotifications} onCheckedChange={handleEmail} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Push Notifications</Label>
              <p className="text-xs text-muted-foreground">Reminders, due dates, assignments, and updates in your browser</p>
            </div>
            <Switch checked={pushNotifications} onCheckedChange={handlePush} />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {pushPermission === 'unsupported' ? (
              'Not supported on this device/browser. iOS Safari requires installing the app (Add to Home Screen) for push.'
            ) : pushPermission === 'denied' ? (
              'Blocked in browser settings. Chrome: Site settings → Notifications → Allow.'
            ) : pushPermission === 'granted' ? (
              pushNotifications
                ? 'Enabled. Scheduled alerts arrive when their reminder or due window is reached.'
                : 'Browser permission is granted, but push is disabled in Actiproc (toggle is OFF).'
            ) : pushNotifications ? (
              'Not allowed yet — turn ON to request permission.'
            ) : (
              'Off (enable to request permission).'
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Team Activity</Label>
              <p className="text-xs text-muted-foreground">Notifications when team members complete actions</p>
            </div>
            <Switch checked={teamActivity} onCheckedChange={handleTeamActivity} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Repeat2 className="h-4 w-4" /> Recurring work check-ins
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="recurrence-alerts-toggle" className="text-sm font-medium">Alert me when recurring work is missed</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Covers daily and weekly Actions and checklist items. Off by default.
                One reminder per calendar week at most, even if several days are missed.
              </p>
            </div>
            <Switch id="recurrence-alerts-toggle" checked={recurrenceAlertsEnabled} disabled={recurrenceAlertsBusy}
              onCheckedChange={value=>void updateRecurrencePreference('recurrence_missed_alerts_enabled',value)}/>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium">Notify after</Label>
              <p className="text-[11px] text-muted-foreground">Consecutive missed scheduled occurrences</p>
            </div>
            <Select value={String(recurrenceAlertThreshold)} disabled={!recurrenceAlertsEnabled||recurrenceAlertsBusy}
              onValueChange={value=>void updateRecurrencePreference('recurrence_missed_alert_threshold',Number(value) as 2|3|5)}>
              <SelectTrigger className="h-9 w-[112px]" aria-label="Number of missed occurrences">
                <SelectValue/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 misses</SelectItem>
                <SelectItem value="3">3 misses</SelectItem>
                <SelectItem value="5">5 misses</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Check-ins appear in the notification center. Browser push follows your Push Notifications setting.
            Past dates are never automatically completed or copied into today's workload.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
