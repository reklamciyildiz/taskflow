'use client';
import { useState } from 'react';
import { useTaskContext } from '@/components/TaskContext';
import { Input } from '@/components/ui/input';
import { StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function QuickCapture() {
  const { addTask, currentTeam, currentUser, generalBoardColumns, organizationId } = useTaskContext();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const title = value.trim();
    if (!title || !currentTeam || !organizationId || busy) return;
    setBusy(true);
    try {
      await addTask({
        title,
        description: '',
        priority: 'medium',
        teamId: currentTeam.id,
        projectId: null,
        status: generalBoardColumns.find((stage) => !stage.isTerminal)?.id ?? generalBoardColumns[0]?.id ?? 'todo',
        createdBy: currentUser?.id || '',
        assigneeId: null,
        customerId: null,
      });
      setValue('');
      toast.success('Added to Inbox');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create Action');
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
      <form
        className="flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          value={value}
          disabled={busy || !currentTeam || !organizationId}
          onChange={(e) => setValue(e.target.value)}
          // Mobile virtual keyboards are inconsistent about firing keydown for "send/go".
          // Use both Enter interception and form submit as a robust fallback.
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onSubmit();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onSubmit();
            }
          }}
          placeholder={
            currentTeam && organizationId
              ? 'Capture a note… (Enter to add to Inbox)'
              : 'Loading workspace…'
          }
          enterKeyHint="send"
          className="h-11 border-0 bg-transparent text-base shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0"
          aria-label="Quick capture"
        />
        {/* Hidden submit for mobile keyboards / accessibility */}
        <button type="submit" className="sr-only" aria-hidden />
      </form>
    </div>
  );
}
