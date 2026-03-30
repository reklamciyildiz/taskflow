'use client';

import { useState, useEffect } from 'react';
import { useView } from '@/components/ViewContext';
import { Plus, Trash2, Power, PowerOff, ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
  created_at: string;
}

interface WebhookLog {
  id: string;
  event: string;
  success: boolean;
  attempts: number;
  created_at: string;
  response: {
    status: number;
    body?: string;
  };
}

const EVENT_OPTIONS = [
  { value: 'task.created', label: 'Task Created', description: 'When a new task is created' },
  { value: 'task.updated', label: 'Task Updated', description: 'When a task is updated' },
  { value: 'task.deleted', label: 'Task Deleted', description: 'When a task is deleted' },
  { value: 'task.completed', label: 'Task Completed', description: 'When a task is marked as done' },
  { value: 'task.assigned', label: 'Task Assigned', description: 'When a task is assigned to someone' },
];

export default function IntegrationsPage() {
  const { setCurrentView } = useView();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isSecretOpen, setIsSecretOpen] = useState(false);
  const [newWebhookSecret, setNewWebhookSecret] = useState('');
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    events: [] as string[],
  });

  useEffect(() => {
    setCurrentView('integrations');
  }, [setCurrentView]);

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      const res = await fetch('/api/webhooks');
      const data = await res.json();
      if (data.success) {
        setWebhooks(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
    }
  };

  const createWebhook = async () => {
    if (!formData.name || !formData.url || formData.events.length === 0) {
      alert('Please fill all fields and select at least one event');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        setWebhooks([data.data, ...webhooks]);
        setIsCreateOpen(false);
        setFormData({ name: '', url: '', events: [] });
        setNewWebhookSecret(data.data.secret);
        setIsSecretOpen(true);
      } else {
        alert('Failed to create webhook: ' + data.error);
      }
    } catch (error) {
      alert('Failed to create webhook');
    }
    setLoading(false);
  };

  const toggleWebhook = async (webhook: Webhook) => {
    try {
      const res = await fetch(`/api/webhooks/${webhook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !webhook.active }),
      });
      const data = await res.json();

      if (data.success) {
        setWebhooks(webhooks.map((w) => (w.id === webhook.id ? data.data : w)));
      }
    } catch (error) {
      console.error('Failed to toggle webhook:', error);
    }
  };

  const deleteWebhook = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        setWebhooks(webhooks.filter((w) => w.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete webhook:', error);
    }
  };

  const viewLogs = async (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setIsLogsOpen(true);

    try {
      const res = await fetch(`/api/webhooks/${webhook.id}/logs?limit=20`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(secret);
    setTimeout(() => setCopiedSecret(null), 2000);
  };

  const toggleEvent = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter((e) => e !== event) : [...prev.events, event],
    }));
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Integrations</h1>
          <p className="text-muted-foreground mt-1">
            Connect TaskFlow with external services using webhooks
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Webhook
        </Button>
      </div>

      <Card className="p-6 mb-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">🔗 What are Webhooks?</h3>
        <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
          Webhooks send real-time notifications to your apps when events happen in TaskFlow. Perfect for Zapier,
          n8n, Make.com, or custom integrations!
        </p>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="bg-white dark:bg-slate-800">
            ✅ Zapier
          </Badge>
          <Badge variant="outline" className="bg-white dark:bg-slate-800">
            ✅ n8n
          </Badge>
          <Badge variant="outline" className="bg-white dark:bg-slate-800">
            ✅ Make.com
          </Badge>
          <Badge variant="outline" className="bg-white dark:bg-slate-800">
            ✅ Custom Apps
          </Badge>
        </div>
      </Card>

      {webhooks.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-6xl mb-4">🔌</div>
          <h3 className="text-xl font-semibold mb-2">No webhooks yet</h3>
          <p className="text-muted-foreground mb-4">
            Create your first webhook to start receiving real-time notifications
          </p>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Webhook
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id} className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{webhook.name}</h3>
                    <Badge variant={webhook.active ? 'default' : 'secondary'}>
                      {webhook.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <ExternalLink className="w-4 h-4" />
                    <code className="bg-muted px-2 py-1 rounded text-xs">{webhook.url}</code>
                  </div>

                  <div className="flex gap-2 flex-wrap mb-3">
                    {webhook.events.map((event) => (
                      <Badge key={event} variant="outline" className="text-xs">
                        {event}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Secret:</span>
                    <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                      {webhook.secret.substring(0, 20)}...
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copySecret(webhook.secret)}
                      className="h-6 px-2"
                    >
                      {copiedSecret === webhook.secret ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => viewLogs(webhook)}>
                    View Logs
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleWebhook(webhook)}>
                    {webhook.active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => deleteWebhook(webhook.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Webhook</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                placeholder="My Zapier Integration"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <Label>Webhook URL</Label>
              <Input
                placeholder="https://hooks.zapier.com/hooks/catch/..."
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Get this URL from Zapier, n8n, Make.com, or your custom app
              </p>
            </div>

            <div>
              <Label>Events to Subscribe</Label>
              <div className="space-y-2 mt-2">
                {EVENT_OPTIONS.map((event) => (
                  <label
                    key={event.value}
                    className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={formData.events.includes(event.value)}
                      onChange={() => toggleEvent(event.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{event.label}</div>
                      <div className="text-xs text-muted-foreground">{event.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createWebhook} disabled={loading}>
              {loading ? 'Creating...' : 'Create Webhook'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLogsOpen} onOpenChange={setIsLogsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Webhook Logs - {selectedWebhook?.name}</DialogTitle>
          </DialogHeader>

          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No logs yet. Webhook will appear here when triggered.
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <Card key={log.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={log.success ? 'default' : 'destructive'}>
                        {log.success ? '✓ Success' : '✗ Failed'}
                      </Badge>
                      <Badge variant="outline">{log.event}</Badge>
                      <span className="text-xs text-muted-foreground">Attempts: {log.attempts}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <code className="bg-muted px-2 py-1 rounded text-xs">{log.response.status}</code>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isSecretOpen} onOpenChange={setIsSecretOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="w-6 h-6" />
              Webhook Created Successfully!
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">⚠️</div>
                <div>
                  <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">Save This Secret Key!</h4>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    This is the only time you'll see this secret. You'll need it to verify webhook signatures.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium mb-2 block">Your Webhook Secret</Label>
              <div className="flex gap-2">
                <Input value={newWebhookSecret} readOnly className="font-mono text-sm bg-muted" />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(newWebhookSecret);
                    setCopiedSecret(newWebhookSecret);
                    setTimeout(() => setCopiedSecret(null), 2000);
                  }}
                >
                  {copiedSecret === newWebhookSecret ? (
                    <>
                      <Check className="w-4 h-4 mr-2 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">📚 How to Use This Secret</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Use it to verify webhook signatures (HMAC-SHA256)</li>
                <li>• Store it securely in your environment variables</li>
                <li>• Never commit it to version control</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setIsSecretOpen(false)} className="w-full">
              I've Saved the Secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
