// Webhook types and utilities for Axiom

export type WebhookEvent = 
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'task.completed'
  | 'task.assigned'
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  | 'team.created'
  | 'team.updated'
  | 'team.member_added'
  | 'team.member_removed';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  organizationId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: any;
  response: {
    status: number;
    body?: any;
    error?: string;
  } | null;
  success: boolean;
  attempts: number;
  nextRetryAt: Date | null;
  createdAt: Date;
}

export interface WebhookPayload<T = any> {
  event: WebhookEvent;
  timestamp: string;
  organizationId: string;
  data: T;
}

// Task event payloads
export interface TaskCreatedPayload {
  task: {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    dueDate: string | null;
    assigneeId: string | null;
    customerId: string | null;
    teamId: string;
    createdBy: string;
  };
}

export interface TaskUpdatedPayload {
  task: {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    dueDate: string | null;
    assigneeId: string | null;
    customerId: string | null;
    teamId: string;
  };
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

export interface TaskDeletedPayload {
  taskId: string;
  teamId: string;
}

export interface TaskCompletedPayload {
  task: {
    id: string;
    title: string;
    completedBy: string;
    completedAt: string;
  };
}

export interface TaskAssignedPayload {
  task: {
    id: string;
    title: string;
    assigneeId: string;
    assignedBy: string;
  };
}

// Customer event payloads
export interface CustomerCreatedPayload {
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
}

export interface CustomerUpdatedPayload {
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

export interface CustomerDeletedPayload {
  customerId: string;
}

// Team event payloads
export interface TeamCreatedPayload {
  team: {
    id: string;
    name: string;
    description: string;
  };
}

export interface TeamUpdatedPayload {
  team: {
    id: string;
    name: string;
    description: string;
  };
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

export interface TeamMemberAddedPayload {
  team: {
    id: string;
    name: string;
  };
  member: {
    id: string;
    email: string;
    role: string;
  };
}

export interface TeamMemberRemovedPayload {
  team: {
    id: string;
    name: string;
  };
  memberId: string;
}

// Webhook signature verification
export function generateWebhookSignature(payload: string, secret: string): string {
  const crypto = require('crypto');
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const expectedSignature = generateWebhookSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Generate random webhook secret
export function generateWebhookSecret(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

// Webhook retry configuration
export const WEBHOOK_RETRY_CONFIG = {
  maxAttempts: 3,
  retryDelays: [60, 300, 900], // 1min, 5min, 15min in seconds
  timeout: 10000, // 10 seconds
};

// Event descriptions for UI
export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEvent, string> = {
  'task.created': 'Triggered when a new task is created',
  'task.updated': 'Triggered when a task is updated',
  'task.deleted': 'Triggered when a task is deleted',
  'task.completed': 'Triggered when a task is marked as completed',
  'task.assigned': 'Triggered when a task is assigned to someone',
  'customer.created': 'Triggered when a new customer is created',
  'customer.updated': 'Triggered when a customer is updated',
  'customer.deleted': 'Triggered when a customer is deleted',
  'team.created': 'Triggered when a new team is created',
  'team.updated': 'Triggered when a team is updated',
  'team.member_added': 'Triggered when a member is added to a team',
  'team.member_removed': 'Triggered when a member is removed from a team',
};
