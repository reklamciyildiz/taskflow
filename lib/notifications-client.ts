/**
 * Typed helpers for in-app notifications (GET/POST /api/notifications).
 */

import { fetchJsonWithRetry } from '@/lib/api';

export interface InAppNotification {
  id: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  read: boolean;
  created_at: string;
}

export interface NotificationsPayload {
  notifications: InAppNotification[];
  unreadCount: number;
}

export async function fetchNotificationsList(
  limit = 20
): Promise<NotificationsPayload | null> {
  // Retry transient 5xx/network failures (first paint / tab-refocus request burst) so the
  // bell doesn't briefly drop to "No notifications yet".
  const result = await fetchJsonWithRetry(`/api/notifications?limit=${limit}`);
  if (!result || !result.ok) return null;
  const data = result.json as { success?: boolean; data?: NotificationsPayload } | null;
  if (!data || !data.success || !data.data) return null;
  return data.data;
}

export async function markNotificationReadApi(
  notificationId: string
): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markRead', notificationId }),
    });
  } catch {
    return false;
  }
  let data: { success?: boolean };
  try {
    data = await response.json();
  } catch {
    return false;
  }
  return response.ok && data.success === true;
}

export async function markAllNotificationsReadApi(): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markAllRead' }),
    });
  } catch {
    return false;
  }
  let data: { success?: boolean };
  try {
    data = await response.json();
  } catch {
    return false;
  }
  return response.ok && data.success === true;
}
