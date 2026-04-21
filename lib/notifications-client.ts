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
  let response: Response;
  try {
    response = await fetch(`/api/notifications?limit=${limit}`);
  } catch {
    return null;
  }
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
