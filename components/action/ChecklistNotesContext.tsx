"use client";

import React, { createContext, useContext, useState } from 'react';
import { Link2, Loader2, Plus, StickyNote, Unlink, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Note } from '@/lib/types';
import type { ChecklistNoteLink } from '@/lib/checklist-note-links';
import { linkedNotesForItem } from '@/lib/checklist-note-links';
import { cn } from '@/lib/utils';

export type ChecklistNotesContextValue = {
  notes: Note[];
  links: ChecklistNoteLink[];
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  createLinkedNote: (itemId: string, itemText: string) => Promise<boolean>;
  linkNote: (itemId: string, noteId: string) => Promise<boolean>;
  unlinkNote: (itemId: string, noteId: string) => Promise<boolean>;
  openNote: (noteId: string) => void;
};

export const ChecklistNotesContext = createContext<ChecklistNotesContextValue | null>(null);

/** One compact control per checklist item. Long notes never render inside rows. */
export function ChecklistNoteChip({ itemId, itemText }: {itemId:string;itemText:string}) {
  const context=useContext(ChecklistNotesContext);
  const [open,setOpen]=useState(false);
  const [picker,setPicker]=useState(false);
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState(false);
  if(!context||!itemId)return null;
  const linked=linkedNotesForItem(itemId,context.notes,context.links);
  const linkedIds=new Set(linked.map(note=>note.id));
  const remaining=context.notes.filter(note=>!linkedIds.has(note.id) &&
    (note.title||'Untitled note').toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  const count=linked.length;
  const perform=async(task:()=>Promise<boolean>,close=false)=>{
    if(busy)return;
    setBusy(true);
    try{
      const success=await task();
      if(success){
        if(close)setOpen(false);
        setPicker(false);
        setQuery('');
      }
    }finally{setBusy(false);}
  };
  if(!context.canEdit && !count)return null;
  return (
    <Popover open={open} onOpenChange={(next)=>{setOpen(next);if(!next){setPicker(false);setQuery('');}}}>
      <PopoverTrigger asChild>
        <button type="button" contentEditable={false}
          aria-label={count?String(count)+' linked notes for checklist item':'Connect a note to this checklist item'}
          className={cn(
            'checklist-note-chip inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70',
            count?'bg-primary/[0.08] text-primary hover:bg-primary/[0.14]':
              'text-muted-foreground/70 hover:bg-muted hover:text-foreground opacity-0 group-hover/checkitem:opacity-100 focus-visible:opacity-100 max-sm:opacity-100',
          )}
        >
          <StickyNote className="h-3.5 w-3.5" aria-hidden/>
          {count>0?<span>{count} {count===1?'note':'notes'}</span>:null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8}
        className="z-[80] w-[min(340px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-border/70 bg-popover p-0 shadow-xl"
        onOpenAutoFocus={event=>event.preventDefault()}>
        <div className="flex items-start justify-between gap-2 border-b border-border/60 px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">Linked notes</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{count} connected to this checklist item</p>
          </div>
          <button type="button" aria-label="Close linked notes"
            onClick={()=>setOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4"/>
          </button>
        </div>
        <div className="max-h-52 space-y-1 overflow-y-auto p-2">
          {linked.map(note=>(
            <div key={note.id} className="flex min-w-0 items-center gap-1 rounded-lg hover:bg-muted/70">
              <button type="button" onClick={()=>{setOpen(false);context.openNote(note.id);}}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <StickyNote className="h-3.5 w-3.5 shrink-0 text-primary/70"/>
                <span className="truncate">{note.title.trim()||'Untitled note'}</span>
              </button>
              {context.canEdit&&<button type="button" disabled={busy}
                aria-label={'Unlink '+(note.title||'Untitled note')}
                title="Unlink (the note is kept)"
                onClick={()=>void perform(()=>context.unlinkNote(itemId,note.id))}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring">
                <Unlink className="h-3.5 w-3.5"/>
              </button>}
            </div>
          ))}
          {!count&&<p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No notes linked yet. Your checklist stays compact.
          </p>}
        </div>
        {context.error&&<p role="alert" className="border-t border-border/60 px-3 py-2 text-xs text-destructive">{context.error}</p>}
        {context.loading&&<p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin"/> Loading connections…
        </p>}
        {context.canEdit&&!context.error&&(
          <div className="border-t border-border/60 p-2">
            {picker?(
              <div className="space-y-2">
                <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
                  placeholder="Search Action notes…" aria-label="Search notes to connect"
                  className="h-9 w-full rounded-lg border border-border/60 bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"/>
                <div className="max-h-40 overflow-y-auto">
                  {remaining.length?remaining.map(note=>(
                    <button type="button" key={note.id} disabled={busy}
                      onClick={()=>void perform(()=>context.linkNote(itemId,note.id))}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-primary"/>
                      <span className="min-w-0 truncate">{note.title.trim()||'Untitled note'}</span>
                    </button>
                  )):<p className="px-2 py-3 text-xs text-muted-foreground">No other notes found.</p>}
                </div>
                <button type="button" onClick={()=>setPicker(false)} className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Back</button>
              </div>
            ):(
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" disabled={busy||context.loading}
                  onClick={()=>void perform(()=>context.createLinkedNote(itemId,itemText),true)}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {busy?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Plus className="h-3.5 w-3.5"/>}
                  New note
                </button>
                <button type="button" disabled={busy||context.loading}
                  onClick={()=>setPicker(true)}
                  className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border/70 px-2 text-[11px] font-medium hover:bg-muted disabled:opacity-50">
                  <Link2 className="h-3.5 w-3.5"/> Connect existing
                </button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
