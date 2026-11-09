/**
 * A Note remains owned by an Action. Linking it to one or more TipTap taskItem
 * identities adds navigable context; it never duplicates the Note document.
 */
export interface ChecklistNoteLink {
  noteId: string;
  checklistItemId: string;
  createdAt: string;
}

export function checklistItemExists(document: unknown, itemId: string): boolean {
  if (!itemId || itemId.length > 200) return false;
  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    const value = node as { type?:unknown; attrs?:{id?:unknown}; content?:unknown };
    if (value.type === 'taskItem' && value.attrs?.id === itemId) return true;
    return Array.isArray(value.content) && value.content.some(visit);
  };
  return visit(document);
}

/** Defensive display filter; never trust links returned from another Action. */
export function linkedNotesForItem<T extends { id: string }>(
  itemId: string,
  notes: readonly T[],
  links: readonly ChecklistNoteLink[],
): T[] {
  const allowed = new Set(links.filter(link=>link.checklistItemId===itemId).map(link=>link.noteId));
  return notes.filter(note=>allowed.has(note.id));
}

export function noteChecklistItemIds(noteId:string,links:readonly ChecklistNoteLink[]):string[] {
  return [...new Set(links.filter(link=>link.noteId===noteId).map(link=>link.checklistItemId))];
}
