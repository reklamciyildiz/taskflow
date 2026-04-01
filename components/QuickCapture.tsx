'use client';

import { useState } from 'react';
import { useTaskContext } from '@/components/TaskContext';
import { Input } from '@/components/ui/input';
import { StickyNote } from 'lucide-react';
import { ensureInboxProjectId } from '@/lib/inbox-project';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function QuickCapture() {
  const { addTask, currentTeam, currentUser, projects, organizationId } = useTaskContext();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const title = value.trim();
    if (!title || !currentTeam || busy) return;
    setBusy(true);
    try {
      const inboxId = await ensureInboxProjectId({
        projects,
        currentTeam,
        organizationId,
      });
      if (!inboxId) {
        toast.error('Inbox süreci oluşturulamadı. Organizasyon bağlantını kontrol et.');
        return;
      }
      await addTask({
        title,
        description: '',
        status: 'todo',
        priority: 'medium',
        teamId: currentTeam.id,
        projectId: inboxId,
        createdBy: currentUser?.id || '',
        assigneeId: null,
        customerId: null,
      });
      setValue('');
      toast.success('Inbox’a aksiyon eklendi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        'mb-6 rounded-xl border border-border/50 bg-card/50 px-3 py-2 shadow-sm',
        'supports-[backdrop-filter]:backdrop-blur-sm'
      )}
    >
      <div className="flex items-center gap-3">
        <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          value={value}
          disabled={busy || !currentTeam}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onSubmit();
            }
          }}
          placeholder="Bir not al… (Enter ile Inbox’a aksiyon olarak eklenir)"
          className="h-11 border-0 bg-transparent text-base shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0"
          aria-label="Hızlı yakalama"
        />
      </div>
    </div>
  );
}
