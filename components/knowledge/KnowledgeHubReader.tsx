'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight, BookOpen, CheckSquare2, ChevronLeft, ChevronRight,
  Clock3, FolderOpen, Search, ShieldCheck, Star, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  focusKnowledgeMatch, formatKnowledgeEntryDate, normalizeKnowledgePinId,
  setChecklistItemChecked, type KnowledgeHubCard, type KnowledgeMatch,
  type KnowledgeContentFilter,
} from '@/lib/knowledge-retrieval';
import type { Task, TaskUpdateFields } from '@/lib/types';

export type KnowledgeReaderSelection = {
  cardId: string;
  matches: KnowledgeMatch[];
  query: string;
  preferred: KnowledgeContentFilter;
};

type ReaderProps = {
  card: KnowledgeHubCard | null;
  selection: KnowledgeReaderSelection | null;
  open: boolean;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onTogglePin: (card: KnowledgeHubCard) => void;
  pinned: boolean;
  tasksById: Map<string, Task>;
  canEditTask: (creatorId?: string | null, assigneeId?: string | null) => boolean;
  updateTask: (taskId: string, updates: TaskUpdateFields) => Promise<boolean>;
  onSaveError: (message: string) => void;
};

const NOTES_PER_PAGE = 6;
const CHECKLIST_PER_PAGE = 10;
const MATCHES_PER_PAGE = 6;

/** Render highlighted text as React nodes; never interpret note text as HTML. */
export function highlightKnowledgeText(text: string, query: string): ReactNode {
  const term = query.trim();
  if (!term || !text) return text;
  const lower = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  if (!needle) return text;
  const pieces: ReactNode[] = [];
  let start = 0;
  for (let occurrence = 0; occurrence < 60; occurrence += 1) {
    const found = lower.indexOf(needle, start);
    if (found < 0) break;
    if (found > start) pieces.push(text.slice(start, found));
    pieces.push(
      <mark key={found} className="rounded-sm bg-amber-300/45 px-0.5 text-inherit dark:bg-amber-400/30">
        {text.slice(found, found + term.length)}
      </mark>,
    );
    start = found + term.length;
  }
  if (start < text.length) pieces.push(text.slice(start));
  return pieces.length ? pieces : text;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
}

export function KnowledgeHubReader({
  card, selection, open, onClose, onOpenTask, onTogglePin,
  pinned, tasksById, canEditTask, updateTask, onSaveError,
}: ReaderProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [notePage, setNotePage] = useState(0);
  const [checklistPage, setChecklistPage] = useState(0);
  const [matchPage, setMatchPage] = useState(0);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'notes' | 'checklist' | 'action'>('notes');
  const [pendingChecklist, setPendingChecklist] = useState<string | null>(null);
  const checklistFocusRef = useRef<HTMLLIElement | null>(null);

  const matches = selection?.matches.filter((item) => item.sourceType !== 'action') ?? [];
  const first = focusKnowledgeMatch(selection?.matches ?? [], selection?.preferred ?? 'all');
  const currentMatch = matches.find((item) => item.sourceId === selectedSourceId) ?? (selectedSourceId === null ? first : null);
  const selectedNote = card?.notes.find((note) => note.id === selectedNoteId) ?? null;
  const query = selection?.query ?? '';
  const focusChecklist = activeSection === 'checklist';

  // Open the precise source selected by search, not the beginning of its parent action.
  useEffect(() => {
    if (!open || !card || !selection) return;
    const focused = focusKnowledgeMatch(selection.matches, selection.preferred);
    const noteId = focused?.sourceType === 'note' ? focused.sourceId :
      !selection.query.trim() && selection.preferred !== 'checklist' ? card.notes[0]?.id ?? null : null;
    const checklistId = focused?.sourceType === 'checklist' ? focused.sourceId :
      !selection.query.trim() && selection.preferred === 'checklist'
        ? card.checklistItems.find((item) => !item.done)?.id ?? card.checklistItems[0]?.id ?? null
        : null;
    setSelectedNoteId(noteId);
    setSelectedChecklistId(checklistId);
    setSelectedSourceId(focused?.sourceId ?? null);
    setActiveSection(focused?.sourceType === 'checklist' ? 'checklist' :
      focused?.sourceType === 'action' ? 'action' :
      selection.preferred === 'checklist' ? 'checklist' : 'notes');
    setNotePage(Math.max(0, Math.floor(Math.max(0, card.notes.findIndex((note) => note.id === noteId)) / NOTES_PER_PAGE)));
    setChecklistPage(Math.max(0, Math.floor(Math.max(0, card.checklistItems.findIndex((item) => item.id === checklistId)) / CHECKLIST_PER_PAGE)));
    setMatchPage(0);
  }, [card?.id, open, selection]);

  useEffect(() => {
    if (!open || !focusChecklist || !selectedChecklistId) return;
    // The matched checklist section can be below the notes reader on narrow devices.
    checklistFocusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [open, focusChecklist, selectedChecklistId, checklistPage]);

  function selectMatch(match: KnowledgeMatch) {
    if (!card) return;
    setSelectedSourceId(match.sourceId);
    if (match.sourceType === 'note') {
      setActiveSection('notes');
      const index = card.notes.findIndex((note) => note.id === match.sourceId);
      setSelectedNoteId(match.sourceId);
      if (index >= 0) setNotePage(Math.floor(index / NOTES_PER_PAGE));
    } else if (match.sourceType === 'checklist') {
      setActiveSection('checklist');
      const index = card.checklistItems.findIndex((item) => item.id === match.sourceId);
      setSelectedChecklistId(match.sourceId);
      if (index >= 0) setChecklistPage(Math.floor(index / CHECKLIST_PER_PAGE));
    }
  }

  async function setChecked(itemId: string, checked: boolean) {
    if (!card || pendingChecklist) return;
    const item = card.checklistItems.find((candidate) => candidate.id === itemId);
    const task = tasksById.get(card.taskId);
    if (!item?.persistedId || !task || !canEditTask(task.createdBy, task.assigneeId)) return;
    const next = setChecklistItemChecked(task.checklistBlocks, item.persistedId, checked);
    if (!next) {
      onSaveError('This checklist item needs to be refreshed in its original action.');
      return;
    }
    setPendingChecklist(itemId);
    try {
      const saved = await updateTask(task.id, { checklistBlocks: next });
      if (!saved) onSaveError('The checklist change could not be saved.');
    } catch {
      onSaveError('The checklist change could not be saved.');
    } finally {
      setPendingChecklist(null);
    }
  }

  const noteTotalPages = Math.max(1, Math.ceil((card?.notes.length ?? 0) / NOTES_PER_PAGE));
  const checklistTotalPages = Math.max(1, Math.ceil((card?.checklistItems.length ?? 0) / CHECKLIST_PER_PAGE));
  const matchTotalPages = Math.max(1, Math.ceil(matches.length / MATCHES_PER_PAGE));
  const selectedNotePage = card?.notes.slice(notePage * NOTES_PER_PAGE, (notePage + 1) * NOTES_PER_PAGE) ?? [];
  const selectedChecklistPage = card?.checklistItems.slice(checklistPage * CHECKLIST_PER_PAGE, (checklistPage + 1) * CHECKLIST_PER_PAGE) ?? [];
  const selectedMatchPage = matches.slice(matchPage * MATCHES_PER_PAGE, (matchPage + 1) * MATCHES_PER_PAGE);

  const notesSection = card ? (
    <section aria-label="Notes and decisions" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4 text-violet-500" aria-hidden /> Notes &amp; decisions
        </h3>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] tabular-nums text-muted-foreground">{card.notes.length}</span>
      </div>
      {card.notes.length ? (
        <div className="overflow-hidden rounded-[19px] border border-border/70 bg-card shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-[190px_minmax(0,1fr)]">
            <div className="border-b border-border/70 bg-muted/25 md:border-b-0 md:border-r">
              <div className="border-b border-border/70 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Browse notes
              </div>
              <div className="space-y-1 p-2">
                {selectedNotePage.map((note) => {
                  const chosen = note.id === selectedNoteId;
                  const matched = matches.some((match) => match.sourceType === 'note' && match.sourceId === note.id);
                  return (
                    <button key={note.id} type="button" aria-current={chosen ? 'true' : undefined}
                      onClick={() => { setSelectedNoteId(note.id); setSelectedSourceId(note.id); setActiveSection('notes'); }}
                      className={cn(
                        'w-full rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        chosen ? 'border-primary/25 bg-primary/[0.085] text-foreground' : 'border-transparent text-muted-foreground hover:bg-muted/75 hover:text-foreground',
                      )}>
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold capitalize">
                        <span className="truncate">{note.type}</span>
                        {matched && <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">Match</span>}
                      </span>
                      <span className="mt-1 block line-clamp-2 break-words text-[12px] font-semibold leading-snug">
                        {note.title || note.text || 'Untitled note'}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground">{dateLabel(note.updatedAt)}</span>
                    </button>
                  );
                })}
              </div>
              {noteTotalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border/70 px-3 py-2 text-[10px] text-muted-foreground">
                  <span>{notePage + 1} / {noteTotalPages}</span>
                  <div className="flex gap-1">
                    <button type="button" aria-label="Previous notes" disabled={notePage === 0}
                      onClick={() => {
                        const page = notePage - 1;
                        setNotePage(page);
                        const nextId = card.notes[page * NOTES_PER_PAGE]?.id ?? null;
                        setSelectedNoteId(nextId);
                        setSelectedSourceId(nextId);
                        setActiveSection('notes');
                      }}
                      className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-30">
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button type="button" aria-label="Next notes" disabled={notePage >= noteTotalPages - 1}
                      onClick={() => {
                        const page = notePage + 1;
                        setNotePage(page);
                        const nextId = card.notes[page * NOTES_PER_PAGE]?.id ?? null;
                        setSelectedNoteId(nextId);
                        setSelectedSourceId(nextId);
                        setActiveSection('notes');
                      }}
                      className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-30">
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="min-w-0 p-4 sm:p-5" aria-live="polite">
              {selectedNote ? (
                <article className="space-y-3" aria-label="Selected note">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold capitalize text-violet-600 dark:text-violet-300">
                      {selectedNote.type}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{dateLabel(selectedNote.updatedAt)}</span>
                  </div>
                  <h4 className="break-words text-[15px] font-semibold leading-snug">
                    {highlightKnowledgeText(selectedNote.title || 'Untitled note', query)}
                  </h4>
                  {selectedNote.text ? (
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.8] text-foreground/90">
                      {highlightKnowledgeText(selectedNote.text, query)}
                    </p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground">This note has a title but no body text.</p>
                  )}
                  {selectedNote.authorName && (
                    <p className="border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                      By {selectedNote.authorName}
                    </p>
                  )}
                </article>
              ) : (
                <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <Search className="h-5 w-5 text-primary" aria-hidden />
                  <p className="max-w-xs text-xs leading-relaxed">
                    {query ? 'Your search matched the action. Choose a note on the left to read it.' :
                      'Select a note to read its content here.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
          No notes are attached to this action.
        </p>
      )}
    </section>
  ) : null;

  const checklistSection = card ? (
    <section aria-label="Checklist items" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CheckSquare2 className="h-4 w-4 text-emerald-500" aria-hidden /> Checklist
        </h3>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] tabular-nums text-muted-foreground">
          {card.checklistItems.filter((item) => item.done).length} / {card.checklistItems.length}
        </span>
      </div>
      {card.checklistItems.length ? (
        <div className="space-y-2">
          <ul className="space-y-2">
            {selectedChecklistPage.map((item) => {
              const task = tasksById.get(card.taskId);
              const editable = task && canEditTask(task.createdBy, task.assigneeId);
              const isSelected = item.id === selectedChecklistId;
              const isMatch = matches.some((match) => match.sourceType === 'checklist' && match.sourceId === item.id);
              return (
                <li key={item.id} ref={isSelected && focusChecklist ? checklistFocusRef : undefined}
                  className={cn('flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                    isSelected && focusChecklist ? 'border-primary/55 bg-primary/[0.08] ring-1 ring-primary/15' :
                      isMatch ? 'border-amber-500/35 bg-amber-500/[0.045]' : 'border-border/70 bg-card')}>
                  <Checkbox checked={item.done}
                    disabled={!editable || !item.persistedId || Boolean(pendingChecklist)}
                    aria-label={'Mark checklist item ' + item.text + ' as ' + (item.done ? 'incomplete' : 'complete')}
                    className="mt-0.5 shrink-0"
                    onCheckedChange={(checked) => void setChecked(item.id, checked === true)} />
                  <span className={cn('min-w-0 flex-1 break-words text-[13px] leading-relaxed', item.done && 'text-muted-foreground line-through')}>
                    {highlightKnowledgeText(item.text, query)}
                  </span>
                  {isSelected && focusChecklist ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[9px] font-semibold text-primary">
                      Found
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {checklistTotalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              <span>Showing {checklistPage * CHECKLIST_PER_PAGE + 1}–{Math.min((checklistPage + 1) * CHECKLIST_PER_PAGE, card.checklistItems.length)} of {card.checklistItems.length}</span>
              <div className="flex gap-1">
                <button type="button" disabled={checklistPage === 0} aria-label="Previous checklist items"
                  onClick={() => {
                    const page = checklistPage - 1;
                    setChecklistPage(page);
                    const nextId = card.checklistItems[page * CHECKLIST_PER_PAGE]?.id ?? null;
                    setSelectedChecklistId(nextId);
                    setSelectedSourceId(nextId);
                    setActiveSection('checklist');
                  }}
                  className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-30">
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button type="button" disabled={checklistPage >= checklistTotalPages - 1} aria-label="Next checklist items"
                  onClick={() => {
                    const page = checklistPage + 1;
                    setChecklistPage(page);
                    const nextId = card.checklistItems[page * CHECKLIST_PER_PAGE]?.id ?? null;
                    setSelectedChecklistId(nextId);
                    setSelectedSourceId(nextId);
                    setActiveSection('checklist');
                  }}
                  className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-30">
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
          No checklist items are attached to this action.
        </p>
      )}
      {card.checklistItems.some((item) => !item.persistedId) && (
        <p className="text-[11px] text-muted-foreground">
          Older checklist items without saved IDs can only be edited from the full action.
        </p>
      )}
    </section>
  ) : null;

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="z-[431] flex h-full w-full max-w-full flex-col gap-0 overflow-y-auto border-l border-border/70 bg-background p-0 shadow-2xl sm:w-[680px] sm:max-w-[680px]">
        {card && (
          <>
            <header className="border-b border-border/70 bg-gradient-to-br from-primary/[0.07] via-card to-card px-5 pb-5 pt-8 sm:px-7">
              <div className="mb-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1">
                  Knowledge reader
                </span>
                {card.projectName && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                    <FolderOpen className="h-3 w-3" aria-hidden />{card.projectName}
                  </span>
                )}
              </div>
              <SheetHeader className="pr-6 text-left">
                <SheetTitle className="break-words text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
                  {card.taskTitle}
                </SheetTitle>
                <SheetDescription className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden />{card.teamName}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden />Updated {formatKnowledgeEntryDate(card.sortDate)}</span>
                </SheetDescription>
              </SheetHeader>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button type="button"
                  onClick={() => { onClose(); onOpenTask(card.taskId); }}
                  className="h-10 rounded-xl px-4 text-xs font-semibold">
                  Open full action <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
                </Button>
                <Button type="button" variant="outline"
                  className="h-10 rounded-xl text-xs" onClick={() => onTogglePin(card)}>
                  <Star className={cn('mr-1.5 h-3.5 w-3.5', pinned && 'fill-amber-400 text-amber-500')} aria-hidden />
                  {pinned ? 'Unpin' : 'Pin'}
                </Button>
              </div>
            </header>

            <div className="flex-1 space-y-6 px-5 py-6 sm:px-7">
              {query.trim() && matches.length > 0 && (
                <section aria-label="Search matches" className="rounded-[18px] border border-primary/25 bg-primary/[0.035] p-3.5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-xs font-semibold">
                      <Search className="h-3.5 w-3.5 text-primary" aria-hidden />
                      Search matches <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] tabular-nums text-primary">{matches.length}</span>
                    </h3>
                    {matchTotalPages > 1 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {matchPage + 1} / {matchTotalPages}
                        <button type="button" aria-label="Previous matches" disabled={matchPage === 0}
                          className="rounded-lg border border-border p-1.5 hover:bg-card disabled:opacity-30"
                          onClick={() => setMatchPage((page) => page - 1)}><ChevronLeft className="h-3 w-3" aria-hidden /></button>
                        <button type="button" aria-label="Next matches" disabled={matchPage >= matchTotalPages - 1}
                          className="rounded-lg border border-border p-1.5 hover:bg-card disabled:opacity-30"
                          onClick={() => setMatchPage((page) => page + 1)}><ChevronRight className="h-3 w-3" aria-hidden /></button>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {selectedMatchPage.map((hit) => (
                      <button key={hit.sourceType + ':' + hit.sourceId} type="button"
                        aria-pressed={currentMatch?.sourceId === hit.sourceId}
                        onClick={() => selectMatch(hit)}
                        className={cn('rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                          currentMatch?.sourceId === hit.sourceId ? 'border-primary/40 bg-card shadow-sm' : 'border-border/70 bg-background/75 hover:bg-card')}>
                        <span className="block text-[10px] font-semibold text-primary">{hit.label}</span>
                        <span className="mt-1 block line-clamp-2 break-words text-[11px] leading-relaxed text-foreground/80">
                          {hit.snippet || 'Matched content'}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {focusChecklist ? checklistSection : notesSection}
              {focusChecklist ? notesSection : checklistSection}
            </div>
            <footer className="sticky bottom-0 border-t border-border/70 bg-background/95 px-5 py-4 backdrop-blur-sm sm:px-7">
              <p className="flex items-center gap-2 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Entries remain linked to their action. Checklist changes follow your workspace permissions.
              </p>
            </footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
