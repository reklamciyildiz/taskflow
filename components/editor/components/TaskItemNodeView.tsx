import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import { Calendar as CalendarIcon, Check, GripVertical, UserRound } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DueFlowPicker } from '@/components/due/DueFlowPicker';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useTaskContext } from '@/components/TaskContext';

function initials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  return (a + b).toUpperCase() || '?';
}

function formatDueDateTooltip(iso: string | unknown): string {
  if (typeof iso !== 'string' || !iso) return 'Due date';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return 'Due date';
    return `Due: ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    return 'Due date';
  }
}

function parseDueDateLocal(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const s = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || !mo || !d) return undefined;
    return new Date(y, mo - 1, d, 12, 0, 0, 0);
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

export const TaskItemNodeView = ({ node, updateAttributes, editor, getPos }: any) => {
  const { checked, id, assigneeId, dueDate, reminders } = node.attrs;
  const { currentTeam } = useTaskContext();
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);

  // Auto-generate ID if missing when mounted
  React.useEffect(() => {
    if (!id && typeof getPos === 'function') {
      updateAttributes({ id: uuidv4() });
    }
  }, [id, getPos, updateAttributes]);

  const memberOptions = useMemo(() => {
    return (currentTeam?.members ?? []).map((m) => ({ id: m.id, name: m.name }));
  }, [currentTeam]);

  // isEditable from editor
  const disabled = !editor.isEditable;

  return (
    <NodeViewWrapper className="flex items-start gap-2 my-1 group" data-type="taskItem">
      <div
        className="mt-1 flex items-center justify-center select-none"
        contentEditable={false}
      >
        <div 
          className="cursor-grab text-muted-foreground/30 hover:text-muted-foreground transition-colors mr-1"
          data-drag-handle
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        
        <Checkbox
          checked={!!checked}
          disabled={disabled}
          onCheckedChange={(c) => {
            const isChecked = !!c;
            updateAttributes({ checked: isChecked });
            
            // Auto-sort completed items to the bottom, preserving cursor position
            if (editor && !editor.isDestroyed) {
              setTimeout(() => {
                const { from, to } = editor.state.selection;
                const json = editor.getJSON();
                
                const sortNode = (n: any) => {
                  if (n.type === 'taskList' && n.content) {
                    const undone = n.content.filter((child: any) => !child.attrs?.checked);
                    const done = n.content.filter((child: any) => child.attrs?.checked);
                    n.content = [...undone, ...done];
                  }
                  if (n.content) {
                    n.content.forEach(sortNode);
                  }
                };
                
                sortNode(json);
                editor.commands.setContent(json, false);
                
                // Try to restore cursor, catching errors if position is out of bounds due to structural changes
                try {
                  editor.commands.setTextSelection({ from, to });
                } catch (e) {
                  // Fallback: just put cursor at the end or ignore
                }
              }, 50);
            }
          }}
          className={cn(
            'h-[18px] w-[18px] rounded border-border/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary shadow-sm transition-all',
            checked ? 'opacity-80' : ''
          )}
        />
      </div>

      <div className="flex-1 min-w-0 flex items-start gap-2">
        <NodeViewContent
          className={cn(
            'inline-block flex-1 w-full min-w-0 mt-[1px]',
            checked ? 'line-through text-muted-foreground' : ''
          )}
        />
        
        <div 
          className="flex flex-col items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity mt-0.5"
          contentEditable={false}
        >
          <TooltipProvider delayDuration={400}>
            {/* Assignee Popover */}
            <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
              <Tooltip>
                <PopoverTrigger asChild>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-6 w-6 rounded-md transition-colors',
                        assigneeId && 'bg-muted/40 text-foreground'
                      )}
                      disabled={disabled}
                      aria-label="Assign to team member"
                    >
                      {assigneeId && memberOptions.find((m) => m.id === assigneeId) ? (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                          {initials(memberOptions.find((m) => m.id === assigneeId)!.name)}
                        </span>
                      ) : (
                        <UserRound className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </Button>
                  </TooltipTrigger>
                </PopoverTrigger>
                <TooltipContent>Assign to...</TooltipContent>
              </Tooltip>
              <PopoverContent className="w-56 p-0" align="end" onClick={(e) => e.stopPropagation()}>
                <Command>
                  <CommandList>
                    <CommandGroup heading="Suggestions">
                      <CommandItem
                        onSelect={() => {
                          updateAttributes({ assigneeId: null });
                          setAssigneeOpen(false);
                        }}
                      >
                        <UserRound className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden />
                        <span>Unassigned</span>
                        {(!assigneeId) && (
                          <Check className="ml-auto h-4 w-4 text-primary" aria-hidden />
                        )}
                      </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading=" ">
                      {memberOptions.map((m) => (
                        <CommandItem
                          key={m.id}
                          className="flex items-center gap-2"
                          onSelect={() => {
                            updateAttributes({ assigneeId: m.id });
                            setAssigneeOpen(false);
                          }}
                        >
                          <span className="mr-2 grid h-6 w-6 place-items-center rounded-full bg-muted text-[11px] font-semibold text-foreground/80">
                            {initials(m.name)}
                          </span>
                          <span className="flex-1 truncate">{m.name}</span>
                          {assigneeId === m.id && (
                            <Check className="h-4 w-4 text-primary" aria-hidden />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Due Date Dialog */}
            <Dialog open={dueOpen} onOpenChange={setDueOpen}>
              <Tooltip>
                <DialogTrigger asChild>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-6 w-6 rounded-md transition-colors',
                        dueDate && 'bg-muted/40 text-foreground'
                      )}
                      disabled={disabled}
                      aria-label="Set due date"
                    >
                      <CalendarIcon className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </TooltipTrigger>
                </DialogTrigger>
                <TooltipContent>
                  {formatDueDateTooltip(dueDate)}
                </TooltipContent>
              </Tooltip>
              <DialogContent
                hideClose
                onCloseAutoFocus={(e) => e.preventDefault()}
                className="flex max-h-[92dvh] min-h-0 w-[min(92vw,380px)] max-w-[min(92vw,380px)] flex-col gap-0 overflow-hidden p-0"
              >
                <DueFlowPicker
                  value={parseDueDateLocal(dueDate) ?? null}
                  reminders={Array.isArray(reminders) ? reminders : []}
                  canUseAdvancedReminderPresets={true} // Defaulting to true, backend will validate
                  disabled={disabled}
                  onChange={(next) => {
                    updateAttributes({
                      dueDate: next ? next.toISOString() : null,
                    });
                  }}
                  onRemindersChange={(next) => {
                    updateAttributes({
                      reminders: next,
                    });
                  }}
                  onRequestClose={() => setDueOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </TooltipProvider>
        </div>
      </div>
    </NodeViewWrapper>
  );
};
