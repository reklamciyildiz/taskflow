'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTaskContext } from '@/components/TaskContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { assertStagesRetained, validateStageConfig } from '@/lib/stage-lifecycle';
import type { ProjectColumnConfig } from '@/lib/types';

type RecoveryDetails = { title: string; isTerminal: boolean };

export function InboxStageRecoveryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tasks, currentTeam, generalBoardColumns, inboxBoardStatus, syncInboxStages } = useTaskContext();
  // Import must cover every saved Inbox Action, regardless of the board's
  // customer, priority, due-date, or stage filters.
  const teamActions = useMemo(
    () => tasks.filter(task => task.teamId === currentTeam?.id && task.projectId == null),
    [tasks, currentTeam?.id],
  );
  const missing = useMemo(() => {
    const known = new Set(generalBoardColumns.map(stage => stage.id));
    const counts = new Map<string, number>();
    for (const task of teamActions) {
      if (!known.has(task.status)) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [teamActions, generalBoardColumns]);
  const missingSignature = missing.map(([id]) => id).join('\u0000');
  const [recovered, setRecovered] = useState<Record<string, RecoveryDetails>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Preserve exact stage IDs. Unknown meanings are never guessed from titles
    // or task names: the owner reviews the display names and terminal semantics.
    setRecovered(Object.fromEntries(missing.map(([id]) => [id, { title: id, isTerminal: false }])));
    setAcknowledged(false);
    setError(null);
  }, [open, currentTeam?.id, missingSignature]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || inboxBoardStatus !== 'unconfigured' || !acknowledged) return;
    setError(null);
    setSaving(true);
    try {
      const recoveredColumns: ProjectColumnConfig[] = missing.map(([id]) => ({
        id,
        title: recovered[id]?.title?.trim() || '',
        isTerminal: recovered[id]?.isTerminal === true,
      }));
      const approved = validateStageConfig([...generalBoardColumns, ...recoveredColumns]);
      assertStagesRetained(approved, teamActions.map(task => task.status));
      const ok = await syncInboxStages(approved);
      if (!ok) throw new Error('Inbox is no longer awaiting import. Refresh and check the stages.');
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inbox stage import failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!value && !saving) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] max-w-[640px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review and synchronize Inbox stages</DialogTitle>
          <DialogDescription>
            Team: {currentTeam?.name ?? '—'} · {teamActions.length} saved Inbox Actions.
            Import this team's stage definitions once for web and Android. No Action will be moved or deleted.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={event => { void submit(event); }} className="space-y-4">
          {missing.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                {missing.length} stage IDs referenced by saved Actions are missing from this browser.
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                Stage IDs below are preserved exactly. Confirm each display name and whether the stage means completed.
                If you do not recognize a stage, cancel and check your original browser's settings before importing.
              </p>
              {missing.map(([id, count]) => (
                <div key={id} className="space-y-2 rounded-lg border border-border/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="break-all text-xs">{id}</code>
                    <span className="text-xs text-muted-foreground">{count} Action{count === 1 ? '' : 's'}</span>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`recovered-stage-${id}`}>Display name</Label>
                    <Input
                      id={`recovered-stage-${id}`}
                      required
                      maxLength={100}
                      value={recovered[id]?.title ?? ''}
                      onChange={event => {
                        const title = event.target.value;
                        setRecovered(prev => ({ ...prev, [id]: { title, isTerminal: prev[id]?.isTerminal === true } }));
                      }}
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={recovered[id]?.isTerminal === true}
                      onCheckedChange={checked =>
                        setRecovered(prev => ({ ...prev, [id]: { title: prev[id]?.title ?? id, isTerminal: checked === true } }))
                      }
                    />
                    Completed / terminal stage
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-border/70 p-3 text-sm">
              All saved Inbox Action stage IDs are already present in this browser. Synchronize the configuration to make it canonical across devices.
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox checked={acknowledged} onCheckedChange={checked => setAcknowledged(checked === true)} />
            <span>I have reviewed these stages. Keep every saved Action and its exact stage ID.</span>
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!acknowledged || saving || inboxBoardStatus !== 'unconfigured'}>
              {saving ? 'Synchronizing…' : 'Confirm and sync Inbox'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
