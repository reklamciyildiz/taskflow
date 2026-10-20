'use client';

import { useMemo, useState } from 'react';
import { FileText, Inbox, Loader2, Plus, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTaskContext } from '@/components/TaskContext';
import { ensureInboxProjectId } from '@/lib/inbox-project';
import { noteApi } from '@/lib/api';
import { notifyKnowledgeSourcesChanged } from '@/lib/knowledge-events';

type CaptureMode = 'action' | 'note';

function plainTextDocument(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: paragraph }],
    }));
  return { type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] };
}

export function DashboardCapture({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    addTask,
    currentTeam,
    currentUser,
    organizationId,
    projects,
    tasks,
  } = useTaskContext();
  const [mode, setMode] = useState<CaptureMode>('action');
  const [title, setTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [targetTaskId, setTargetTaskId] = useState('');
  const [busy, setBusy] = useState(false);

  const availableTasks = useMemo(
    () => tasks
      .filter((task) => !currentTeam || task.teamId === currentTeam.id)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()),
    [tasks, currentTeam],
  );

  const reset = () => {
    setTitle('');
    setNoteContent('');
    setTargetTaskId('');
    setMode('action');
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const createAction = async () => {
    const actionTitle = title.trim();
    if (!actionTitle || !currentTeam || !organizationId || busy) return;
    setBusy(true);
    try {
      const inbox = await ensureInboxProjectId({ projects, currentTeam, organizationId });
      if (!inbox.ok) throw new Error(inbox.error || 'Could not open the Inbox process.');
      await addTask({
        title: actionTitle,
        description: '',
        priority: 'medium',
        teamId: currentTeam.id,
        projectId: inbox.projectId,
        createdBy: currentUser?.id || '',
        assigneeId: null,
        customerId: null,
      });
      toast.success('Action added to Inbox');
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create Action');
    } finally {
      setBusy(false);
    }
  };

  const createNote = async () => {
    const content = noteContent.trim();
    if (!targetTaskId || !content || busy) return;
    setBusy(true);
    try {
      const response = await noteApi.create(targetTaskId, {
        title: title.trim() || content.slice(0, 80),
        type: 'note',
        content: plainTextDocument(content),
      });
      if (!response.success || !response.data) throw new Error(response.error || 'Could not create Note');
      notifyKnowledgeSourcesChanged(response.data.teamId);
      toast.success('Note added to Action');
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create Note');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = mode === 'action'
    ? Boolean(title.trim() && currentTeam && organizationId)
    : Boolean(targetTaskId && noteContent.trim());

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[min(680px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto p-0 sm:rounded-xl">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="dashboard-v2-icon bg-primary/10 text-primary"><Plus className="h-4 w-4" /></span>
            Quick Capture
          </DialogTitle>
          <DialogDescription>Create an Inbox Action or attach a real Note to an existing Action.</DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(value) => setMode(value as CaptureMode)} className="px-5 py-4">
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-lg bg-muted/55 p-1">
            <TabsTrigger value="action" className="gap-2"><Inbox className="h-4 w-4" />Action</TabsTrigger>
            <TabsTrigger value="note" className="gap-2"><StickyNote className="h-4 w-4" />Note</TabsTrigger>
          </TabsList>

          <TabsContent value="action" className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dashboard-capture-action">Action title</Label>
              <Input
                id="dashboard-capture-action"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && canSubmit) {
                    event.preventDefault();
                    void createAction();
                  }
                }}
                placeholder="What needs to be done?"
                className="h-11"
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Inbox className="h-3.5 w-3.5" />Saved as an Action in your Inbox process.</p>
            </div>
          </TabsContent>

          <TabsContent value="note" className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label>Target Action</Label>
              <Select value={targetTaskId} onValueChange={setTargetTaskId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Choose the Action that owns this Note" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {availableTasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      <span className="flex min-w-0 items-center gap-2"><FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{task.title}</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dashboard-note-title">Note title <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="dashboard-note-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dashboard-note-content">Note</Label>
              <Textarea
                id="dashboard-note-content"
                value={noteContent}
                onChange={(event) => setNoteContent(event.target.value)}
                placeholder="Capture the context, decision or idea…"
                className="min-h-28 resize-y"
              />
              <p className="text-xs text-muted-foreground">A Note is never attached silently; the selected Action remains visible above.</p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t border-border/60 px-5 py-4 sm:justify-between">
          <Button type="button" variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          <Button
            type="button"
            disabled={!canSubmit || busy}
            onClick={() => void (mode === 'action' ? createAction() : createNote())}
            className="min-h-11 gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'action' ? <Plus className="h-4 w-4" /> : <StickyNote className="h-4 w-4" />}
            {mode === 'action' ? 'Create Action' : 'Create Note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
