'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTaskContext } from '@/components/TaskContext';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function SettingsWorkspacePage() {
  const { refreshData } = useTaskContext();
  const router = useRouter();
  const { update } = useSession();
  const [loading, setLoading] = useState(false);

  const handleLeave = async () => {
    if (
      !confirm(
        "If you're the only member in this organization, your membership will be removed so you can accept another team's invite. Continue?"
      )
    ) return;

    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/reset-solo-workspace', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      toast.success(data.message || 'You left the workspace');
      await update?.();
      router.refresh();
      await refreshData();
      router.push('/onboarding');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace membership.
        </p>
      </div>

      <Card className="border-amber-200/80 dark:border-amber-900/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <LogOut className="h-4 w-4 text-amber-600 dark:text-amber-500" />
            Leave workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            If you accidentally created your own organization and want to accept another team&apos;s
            invite, you can leave from here. This only works when you&apos;re the{' '}
            <strong>only member</strong> in the organization.
          </p>
          <Button
            variant="outline"
            className="border-amber-300 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/40"
            disabled={loading}
            onClick={handleLeave}
          >
            {loading ? 'Working…' : 'Leave my solo workspace'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
