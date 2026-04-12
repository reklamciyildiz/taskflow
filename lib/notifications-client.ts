/**
 * Typed helpers for in-app notifications (GET/POST /api/notifications).
 */

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
  const response = await fetch(`/api/notifications?limit=${limit}`);
  let data: { success?: boolean; data?: NotificationsPayload };
  try {
    data = await response.json();
  } catch {
    return null;
  }
  if (!response.ok || !data.success || !data.data) return null;
  return data.data;
}

export async function markNotificationReadApi(
  notificationId: string
): Promise<boolean> {
  const response = await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markRead', notificationId }),
  });
  let data: { success?: boolean };
  try {
    data = await response.json();
  } catch {
    return false;
  }
  return response.ok && data.success === true;
}

export async function markAllNotificationsReadApi(): Promise<boolean> {
  const response = await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'markAllRead' }),
  });
  let data: { success?: boolean };
  try {
    data = await response.json();
  } catch {
    return false;
  }
  return response.ok && data.success === true;
}
