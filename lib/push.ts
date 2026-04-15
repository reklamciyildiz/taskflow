import webpush from 'web-push';
import { pushSubscriptionDb } from '@/lib/db';
import { supabase } from '@/lib/supabase';

type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

function getVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@taskflow.local';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const vapid = getVapid();
  if (!vapid) return false;
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  configured = true;
  return true;
}

async function isPushEnabledForUser(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('push_notifications')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return true; // table may not exist yet; default to enabled
    if (!data) return true;
    return data.push_notifications !== false;
  } catch {
    return true;
  }
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!ensureConfigured()) return;
  const enabled = await isPushEnabledForUser(userId);
  if (!enabled) return;

  const subs = await pushSubscriptionDb.listActiveByUser(userId);
  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            expirationTime: s.expiration_time ?? undefined,
            keys: { p256dh: s.p256dh, auth: s.auth },
          } as any,
          body
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          try {
            await pushSubscriptionDb.revokeByEndpoint(s.endpoint);
          } catch {
            // ignore
          }
        }
      }
    })
  );
}

