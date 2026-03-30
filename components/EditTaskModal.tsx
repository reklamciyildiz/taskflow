'use client';

import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Task, TaskStatus, TaskPriority, useTaskContext } from '@/components/TaskContext';
import type { JournalLogEntry } from '@/lib/types';
import { TaskProcessJournal } from '@/components/task/TaskProcessJournal';
import { Loader2 } from 'lucide-react';

interface EditTaskModalProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
}

export function EditTaskModal({ task, open, onClose }: EditTaskModalProps) {
  const { updateTask, currentTeam, canEditTask, customers, boardColumns, tasks } = useTaskContext();
  const [loading, setLoading] = useState(false);

  const canEdit = task ? canEditTask(task.createdBy, task.assigneeId) : false;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('unassigned');
  const [customerId, setCustomerId] = useState<string>('none');
  const [dueDate, setDueDate] = useState('');
  const [journalLogs, setJournalLogs] = useState<JournalLogEntry[]>([]);
  const [learnings, setLearnings] = useState('');
  const lastPersistedLearnings = useRef('');
  const learningsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only sync when opening or switching task — not on every `tasks` update (avoids wiping in-progress edits / journal flow)
  useEffect(() => {
    if (!open || !task) return;
    const src = tasks.find((t) => t.id === task.id) ?? task;
    setTitle(src.title);
    setDescription(src.description || '');
    setStatus(src.status);
    setPriority(src.priority);
    setAssigneeId(src.assigneeId || 'unassigned');
    setCustomerId(src.customerId || 'none');
    setDueDate(src.dueDate ? src.dueDate.toISOString().split('T')[0] : '');
    setJournalLogs([...(src.journalLogs ?? [])]);
    const learningsVal = src.learnings ?? '';
    setLearnings(learningsVal);
    lastPersistedLearnings.current = learningsVal.trim();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: read `tasks` only on open / task id change
  }, [open, task?.id]);

  useEffect(() => {
    if (!open || !task || !canEdit) return;
    if (learningsDebounceRef.current) clearTimeout(learningsDebounceRef.current);
    learningsDebounceRef.current = setTimeout(() => {
      const normalized = learnings.trim();
      if (normalized === lastPersistedLearnings.current) return;
      void (async () => {
        const ok = await updateTask(task.id, { learnings: normalized || null });
        if (ok) lastPersistedLearnings.current = normalized;
      })();
    }, 1500);
    return () => {
      if (learningsDebounceRef.current) clearTimeout(learningsDebounceRef.current);
    };
  }, [learnings, open, task?.id, canEdit, task, updateTask]);

  const statusSelectOptions = useMemo(() => {
    const base = boardColumns;
    if (status && !base.some((c) => c.id === status)) {
      return [{ id: status, title: status }, ...base];
    }
    return base;
  }, [boardColumns, status]);

  const handleJournalAppend = async (text: string): Promise<boolean> => {
    if (!task || !canEdit) return false;
    const entry: JournalLogEntry = {
      id:
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `jl-${Date.now()}`,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    const previous = journalLogs;
    const next = [...journalLogs, entry];
    setJournalLogs(next);
    const ok = await updateTask(task.id, { journalLogs: next });
    if (!ok) setJournalLogs(previous);
    return ok;
  };

  const handleJournalUpdate = async (entryId: string, text: string): Promise<boolean> => {
    if (!task || !canEdit) return false;
    const nextText = text.trim();
    if (!nextText) return false;
    const idx = journalLogs.findIndex((x) => x.id === entryId);
    if (idx === -1) return false;

    const previous = journalLogs;
    const now = new Date().toISOString();
    const next = journalLogs.map((x) =>
      x.id === entryId ? { ...x, text: nextText, updatedAt: now } : x
    );
    setJournalLogs(next);
    const ok = await updateTask(task.id, { journalLogs: next });
    if (!ok) setJournalLogs(previous);
    return ok;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!task) return;

    setLoading(true);
    try {
      const ok = await updateTask(task.id, {
        title,
        description,
        status,
        priority,
        assigneeId: assigneeId === 'unassigned' ? null : assigneeId,
        customerId: customerId === 'none' ? null : customerId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        learnings: learnings.trim() || null,
        journalLogs,
      });
      if (ok) {
        lastPersistedLearnings.current = learnings.trim();
        onClose();
      }
    } catch (error) {
      console.error('Failed to update task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
          <DialogTitle>{canEdit ? 'Edit Task' : 'View Task'}</DialogTitle>
          <DialogDescription>
            {canEdit
              ? 'Görev ayrıntıları, süreç günlüğü ve öğrenme notlarını buradan güncelleyin.'
              : 'Bu görevi görüntülüyorsunuz; düzenleme yetkiniz yok.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]"
        >
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              required
              disabled={!canEdit}
              className="min-w-0 max-w-full bg-white dark:bg-gray-800"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description (optional)"
              rows={3}
              disabled={!canEdit}
              className="min-h-[80px] w-full min-w-0 max-w-full break-words bg-white dark:bg-gray-800"
            />
          </div>

          <TaskProcessJournal
            logs={journalLogs}
            canEdit={canEdit}
            disabled={loading}
            onAppend={handleJournalAppend}
            onUpdate={handleJournalUpdate}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)} disabled={!canEdit}>
                <SelectTrigger className="bg-white dark:bg-gray-800">
                  <SelectValue placeholder="Durum" />
                </SelectTrigger>
                <SelectContent>
                  {statusSelectOptions.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)} disabled={!canEdit}>
                <SelectTrigger className="bg-white dark:bg-gray-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={!canEdit}>
                <SelectTrigger className="bg-white dark:bg-gray-800">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {currentTeam?.members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!canEdit}
                className="bg-white dark:bg-gray-800"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId} disabled={!canEdit}>
              <SelectTrigger className="bg-white dark:bg-gray-800">
                <SelectValue placeholder="No Customer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Customer</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-2">
            <Label htmlFor="learnings">Neler öğrendim?</Label>
            <Textarea
              id="learnings"
              value={learnings}
              onChange={(e) => setLearnings(e.target.value)}
              placeholder="Kapanınca veya süreçte kalmak istediğin bilgiler (mülakat cevabı, bug çözümü, kısayol…)"
              rows={4}
              disabled={!canEdit}
              className="max-h-[40vh] min-h-[100px] w-full min-w-0 max-w-full resize-y break-words bg-white dark:bg-gray-800 sm:max-h-[min(40vh,320px)]"
            />
            {canEdit && (
              <p className="text-xs text-muted-foreground">
                Yazmayı bıraktıktan ~1,5 sn sonra otomatik kaydedilir.
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse justify-end gap-2 pt-4 sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose}>
              {canEdit ? 'Cancel' : 'Close'}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={loading || !title.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
