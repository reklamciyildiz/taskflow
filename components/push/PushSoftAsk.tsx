'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { subscribeWebPush } from '@/components/push/push-client';
import { toast } from 'sonner';

const DISMISS_KEY = 'taskflow:pushSoftAskDismissedAt';

function supportsWebPush(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeDismissedNow() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function PushSoftAsk() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [pushPrefEnabled, setPushPrefEnabled] = useState<boolean | null>(null);

  const shouldShow = useMemo(() => {
    // "Enterprise" behavior: if server says the user already enabled push in Settings,
    // do not show the banner (even if browser permission is still default).
    if (pushPrefEnabled === true) return false;
    if (permission !== 'default') return false;
    const dismissedAt = readDismissedAt();
    if (!dismissedAt) return true;
    // Avoid nagging: re-show after 14 days.
    return Date.now() - dismissedAt > 14 * 24 * 60 * 60 * 1000;
  }, [permission, pushPrefEnabled]);

  useEffect(() => {
    if (!supportsWebPush()) {
      setPermission('unsupported');
      setVisible(false);
      return;
    }
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/users/settings', { method: 'GET' });
        if (!res.ok) return;
        const json = (await res.json()) as { success?: boolean; data?: { push_notifications?: boolean } };
        if (cancelled) return;
        if (json?.success && json?.data && typeof json.data.push_notifications === 'boolean') {
          setPushPrefEnabled(json.data.push_notifications);
        }
      } catch {
        // ignore — keep banner logic permission-based only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setVisible(shouldShow);
  }, [shouldShow]);

  const dismiss = useCallback(() => {
    writeDismissedNow();
    setVisible(false);
  }, []);

  const onEnable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const sub = await subscribeWebPush();
      const nextPermission =
        typeof Notification !== 'undefined' ? Notification.permission : ('unsupported' as const);
      setPermission(nextPermission);
      if (!sub) {
        if (nextPermission === 'denied') {
          toast.error('Notifications are blocked. Allow them in your browser site settings to enable push.');
        } else if (nextPermission === 'default') {
          toast.message('No worries — you can enable push anytime in Settings.');
        } else {
          toast.message('Push notifications are not supported on this device/browser.');
        }
        // User denied or unsupported — don't keep nagging in this session.
        dismiss();
        return;
      }
      const subRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!subRes.ok) {
        throw new Error('Failed to save push subscription');
      }
      // Also turn on the preference server-side (best-effort; table may not exist).
      const settingsRes = await fetch('/api/users/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ push_notifications: true }),
      });
      if (!settingsRes.ok) {
        // Not fatal for actual push; subscription is the key piece.
        // Keep it as informational rather than blocking.
        toast.message('Push is enabled, but saving the preference failed. You can toggle it in Settings.');
      } else {
        setPushPrefEnabled(true);
        toast.success('Push notifications enabled.');
      }
      dismiss();
    } catch (e) {
      toast.error('Could not enable push notifications. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, dismiss]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'mb-4 rounded-xl border border-border/60 bg-gradient-to-r from-emerald-500/10 via-background to-cyan-500/10',
        'px-4 py-3 shadow-sm'
      )}
      role="region"
      aria-label="Push notifications prompt"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
          <BellRing className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Enable push notifications to never miss assignments.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            You can change this anytime in Settings.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-8" onClick={() => void onEnable()} disabled={busy}>
              {busy ? 'Enabling…' : 'Enable'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={dismiss} disabled={busy}>
              Not now
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          onClick={dismiss}
          aria-label="Dismiss"
          disabled={busy}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

