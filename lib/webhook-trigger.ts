// Webhook trigger utility for sending webhook events

import { webhookDb } from './db';
import { 
  WebhookEvent, 
  WebhookPayload, 
  generateWebhookSignature,
  WEBHOOK_RETRY_CONFIG 
} from './webhooks';

export async function triggerWebhook<T = any>(
  organizationId: string,
  event: WebhookEvent,
  data: T
): Promise<void> {
  try {
    // Get all active webhooks for this organization that subscribe to this event
    const webhooks = await webhookDb.getActiveByOrganization(organizationId);
    const relevantWebhooks = webhooks.filter(webhook => 
      webhook.events.includes(event)
    );

    if (relevantWebhooks.length === 0) {
      return; // No webhooks to trigger
    }

    // Prepare payload
    const payload: WebhookPayload<T> = {
      event,
      timestamp: new Date().toISOString(),
      organizationId,
      data,
    };

    // Trigger all relevant webhooks in parallel
    await Promise.allSettled(
      relevantWebhooks.map(webhook => sendWebhook(webhook, payload))
    );
  } catch (error) {
    console.error('Error triggering webhooks:', error);
    // Don't throw - webhook failures shouldn't break the main flow
  }
}

async function sendWebhook(
  webhook: any,
  payload: WebhookPayload
): Promise<void> {
  const payloadString = JSON.stringify(payload);
  const signature = generateWebhookSignature(payloadString, webhook.secret);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_RETRY_CONFIG.timeout);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': payload.event,
        'User-Agent': 'Axiom-Webhook/1.0',
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text().catch(() => null);
    const success = response.ok;

    // Log the webhook delivery
    await webhookDb.createLog({
      webhook_id: webhook.id,
      event: payload.event,
      payload: payload,
      response: {
        status: response.status,
        body: responseBody,
      },
      success,
      attempts: 1,
      next_retry_at: success ? undefined : calculateNextRetry(1),
    });

    if (!success) {
      console.error(`Webhook delivery failed for ${webhook.url}: ${response.status}`, {
        event: payload.event,
        responseBody: responseBody?.substring(0, 200),
      });
    }
  } catch (error: any) {
    console.error(`Webhook delivery error for ${webhook.url}:`, error.message);

    // Log the failed delivery
    await webhookDb.createLog({
      webhook_id: webhook.id,
      event: payload.event,
      payload: payload,
      response: {
        status: 0,
        error: error.message,
      },
      success: false,
      attempts: 1,
      next_retry_at: calculateNextRetry(1),
    });
  }
}

function calculateNextRetry(attempts: number): string | undefined {
  if (attempts >= WEBHOOK_RETRY_CONFIG.maxAttempts) {
    return undefined; // No more retries
  }

  const delaySeconds = WEBHOOK_RETRY_CONFIG.retryDelays[attempts - 1] || 900;
  const nextRetry = new Date(Date.now() + delaySeconds * 1000);
  return nextRetry.toISOString();
}

// Retry failed webhooks (can be called by a cron job)
export async function retryFailedWebhooks(): Promise<void> {
  try {
    const failedLogs = await webhookDb.getFailedLogs();

    for (const log of failedLogs) {
      if (log.attempts >= WEBHOOK_RETRY_CONFIG.maxAttempts) {
        // Max attempts reached, mark as permanently failed
        await webhookDb.updateLog(log.id, {
          next_retry_at: null,
        });
        continue;
      }

      // Get webhook details
      const webhook = await webhookDb.getById(log.webhook_id);
      if (!webhook || !webhook.active) {
        // Webhook deleted or disabled, skip retry
        await webhookDb.updateLog(log.id, {
          next_retry_at: null,
        });
        continue;
      }

      // Retry the webhook
      const payloadString = JSON.stringify(log.payload);
      const signature = generateWebhookSignature(payloadString, webhook.secret);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_RETRY_CONFIG.timeout);

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': log.event,
            'User-Agent': 'Axiom-Webhook/1.0',
          },
          body: payloadString,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseBody = await response.text().catch(() => null);
        const success = response.ok;
        const newAttempts = log.attempts + 1;

        await webhookDb.updateLog(log.id, {
          response: {
            status: response.status,
            body: responseBody,
          },
          success,
          attempts: newAttempts,
          next_retry_at: success ? null : calculateNextRetry(newAttempts),
        });
      } catch (error: any) {
        const newAttempts = log.attempts + 1;

        await webhookDb.updateLog(log.id, {
          response: {
            status: 0,
            error: error.message,
          },
          success: false,
          attempts: newAttempts,
          next_retry_at: calculateNextRetry(newAttempts),
        });
      }
    }
  } catch (error) {
    console.error('Error retrying failed webhooks:', error);
  }
}
