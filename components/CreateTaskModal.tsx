'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTaskContext, TaskStatus, TaskPriority } from '@/components/TaskContext';
import { FALLBACK_BOARD_COLUMNS, type ProjectColumnConfig } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DescriptionGeneratorButton } from '@/components/ai/DescriptionGeneratorButton';

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  defaultStatus?: TaskStatus;
}

export function CreateTaskModal({ open, onClose, defaultStatus }: CreateTaskModalProps) {
  const {
    addTask,
    currentTeam,
    currentUser,
    customers,
    projects,
    currentProject,
    boardScope,
    boardProject,
    generalBoardColumns,
  } = useTaskContext();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus || 'todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState<Date>();
  const [assigneeId, setAssigneeId] = useState<string>("unassigned");
  const [customerId, setCustomerId] = useState<string>("none");
  const [projectId, setProjectId] = useState<string>('__auto__');

  const projectsForTeam = useMemo(() => {
    if (!currentTeam) return projects;
    return projects.filter((p) => !p.teamId || p.teamId === currentTeam.id);
  }, [projects, currentTeam?.id]);

  /** Selected process on the board is `boardScope`; in Process Center / ?project= it is `currentProject`. */
  const resolvedProjectId = useMemo(() => {
    if (projectId === '__none__') return null;
    if (projectId === '__auto__') {
      if (boardScope.type === 'project') return boardScope.projectId;
      return currentProject?.id ?? null;
    }
    return projectId;
  }, [projectId, boardScope, currentProject?.id]);

  /** Columns for the selected process via `resolvedProjectId` (supports auto + currentProject fallback). */
  const statusColumns = useMemo((): ProjectColumnConfig[] => {
    const generalCols =
      generalBoardColumns.length > 0 ? generalBoardColumns : FALLBACK_BOARD_COLUMNS;
    const pid = resolvedProjectId;
    if (!pid) return generalCols;
    const proj = projectsForTeam.find((p) => p.id === pid);
    const cfg = proj?.columnConfig;
    return cfg && cfg.length > 0 ? cfg : FALLBACK_BOARD_COLUMNS;
  }, [resolvedProjectId, projectsForTeam, generalBoardColumns]);

  useEffect(() => {
    if (!open) return;
    const ids = statusColumns.map((c) => c.id);
    const first = (ids[0] ?? 'todo') as TaskStatus;
    setStatus((prev) => {
      if (ids.includes(prev)) return prev;
      if (defaultStatus && ids.includes(defaultStatus)) return defaultStatus;
      return first;
    });
  }, [open, statusColumns, defaultStatus]);

  const autoContextLabel = useMemo(() => {
    if (boardScope.type === 'project') {
      return (
        boardProject?.name ??
        projectsForTeam.find((p) => p.id === boardScope.projectId)?.name ??
        'Selected process'
      );
    }
    return currentProject?.name ?? 'none';
  }, [boardScope, boardProject, projectsForTeam, currentProject]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !currentTeam) return;

    addTask({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      dueDate,
      assigneeId: assigneeId === "unassigned" ? null : assigneeId,
      customerId: customerId === "none" ? null : customerId,
      teamId: currentTeam.id,
      projectId: resolvedProjectId,
      createdBy: currentUser?.id || ''
    });

    // Reset form
    setTitle('');
    setDescription('');
    const ids = statusColumns.map((c) => c.id);
    const fallback = (ids[0] ?? 'todo') as TaskStatus;
    setStatus(defaultStatus && ids.includes(defaultStatus) ? defaultStatus : fallback);
    setPriority('medium');
    setDueDate(undefined);
    setAssigneeId("unassigned");
    setCustomerId("none");
    setProjectId('__auto__');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New action</DialogTitle>
          <DialogDescription>
            Fill in the title and any optional fields, then save. As the selected process (or the board’s process)
            changes, the status list is mapped to that workflow’s columns so your action starts in the right stage.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Action title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description (Optional)</Label>
              {title.trim() && (
                <DescriptionGeneratorButton
                  taskTitle={title}
                  existingDescription={description}
                  priority={priority}
                  onDescriptionGenerated={(desc) => setDescription(desc)}
                />
              )}
            </div>
            <Textarea
              id="description"
              placeholder="Short description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status (stage)</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a stage" />
                </SelectTrigger>
                <SelectContent>
                  {statusColumns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                <SelectTrigger>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId || "unassigned"} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select assignee" />
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
          </div>

          <div className="space-y-2">
            <Label>Process</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">
                  Automatic (board selection: {autoContextLabel})
                </SelectItem>
                <SelectItem value="__none__">No process</SelectItem>
                {projectsForTeam.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Automatic: links to the process selected on the board. In General board, no process is assigned and
              statuses follow the general board columns.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Customer (Optional)</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
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

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}