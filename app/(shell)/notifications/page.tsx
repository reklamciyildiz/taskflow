'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  fetchNotificationsList,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  type InAppNotification,
} from '@/lib/notifications-client';

function notificationIcon(type: string): string {
  switch (type) {
    case 'task_assigned':
      return '📋';
    case 'task_completed':
      return '✅';
    case 'invitation':
      return '✉️';
    case 'mention':
      return '💬';
    case 'comment':
      return '💭';
    case 'task_updated':
      return '🔄';
    default:
      return '🔔';
  }
}

function formatRelativeTime(dateString: string, nowMs: number): string {
  const date = new Date(dateString);
  const diffMs = nowMs - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyAll, setBusyAll] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    const data = await fetchNotificationsList(100);
    if (data) {
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const markOneRead = async (id: string) => {
    const ok = await markNotificationReadApi(id);
    if (!ok) return;
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAll = async () => {
    setBusyAll(true);
    try {
      const ok = await markAllNotificationsReadApi();
      if (!ok) return;
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } finally {
      setBusyAll(false);
    }
  };

  const onRowActivate = (n: InAppNotification) => {
    if (!n.read) void markOneRead(n.id);
    if (n.link) router.push(n.link);
  };

  const relative = useMemo(
    () => (d: string) => formatRelativeTime(d, nowMs),
    [nowMs]
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" aria-hidden />
              Notifications
            </CardTitle>
            <CardDescription>
              Assignments and other alerts show up here.
            </CardDescription>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              disabled={busyAll}
              onClick={() => void markAll()}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : items.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Bell className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No notifications yet.
              </p>
              <Button variant="link" asChild className="mt-2">
                <Link href="/board">Go to board</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y border-t" role="list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/50',
                      !n.read && 'bg-primary/5'
                    )}
                    onClick={() => onRowActivate(n)}
                  >
                    <span className="text-xl shrink-0" aria-hidden>
                      {notificationIcon(n.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-sm',
                          n.read
                            ? 'text-muted-foreground'
                            : 'font-medium text-foreground'
                        )}
                      >
                        {n.title}
                      </p>
                      {n.message ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {n.message}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {relative(n.created_at)}
                      </p>
                    </div>
                    {n.link ? (
                      <ExternalLink
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
