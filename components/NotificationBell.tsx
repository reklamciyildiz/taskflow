'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  fetchNotificationsList,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  type InAppNotification,
} from '@/lib/notifications-client';

export function NotificationBell() {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const data = await fetchNotificationsList(20);
    if (data) {
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    void refresh();

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void refresh();
    };

    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!mounted) return;
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, [mounted]);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (notificationId: string) => {
    const ok = await markNotificationReadApi(notificationId);
    if (!ok) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    setLoading(true);
    try {
      const ok = await markAllNotificationsReadApi();
      if (!ok) return;
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = (notification: InAppNotification) => {
    if (!notification.read) {
      void markAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
      setIsOpen(false);
    }
  };

  const getNotificationIcon = (type: string) => {
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
  };

  const formatTime = useMemo(() => {
    return (dateString: string) => {
      const date = new Date(dateString);
      const diffMs = (nowMs || Date.now()) - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    };
  }, [nowMs]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
        aria-label="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between border-b border-border bg-muted/60 px-4 py-3">
            <h3 className="font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
                <p className="mt-2 text-xs text-muted-foreground/80">
                  Visit the notification center for history and settings.
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNotificationClick(notification)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleNotificationClick(notification);
                    }
                  }}
                  className={`cursor-pointer border-b border-border px-4 py-3 transition-colors last:border-0 ${
                    notification.read
                      ? 'bg-popover hover:bg-muted/50'
                      : 'bg-primary/5 hover:bg-primary/10'
                  }`}
                >
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 text-xl" aria-hidden>
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm ${
                          notification.read ? 'text-muted-foreground' : 'font-medium text-foreground'
                        }`}
                      >
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {notification.message}
                        </p>
                      )}
                      <p
                        className="mt-1 text-xs text-muted-foreground/80"
                        suppressHydrationWarning
                      >
                        {mounted ? formatTime(notification.created_at) : ''}
                      </p>
                    </div>
                    {notification.link && (
                      <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border bg-muted/40 px-4 py-2">
            <Link
              href="/notifications"
              className="block w-full text-center text-xs font-medium text-primary hover:underline"
              onClick={() => setIsOpen(false)}
              prefetch
              scroll={false}
            >
              Go to notification center
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
