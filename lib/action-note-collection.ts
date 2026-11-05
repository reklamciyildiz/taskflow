import type { Note, NoteType } from '@/lib/types';
import { extractTextFromNode } from '@/lib/tiptap-parser';

export type ActionNoteTypeFilter = 'all' | NoteType;
export type ActionNoteSort = 'updated' | 'oldest' | 'title' | 'created';
export type IndexedActionNote = { note: Note; searchText: string; heading: string; preview: string };

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ı/g, 'i');
}

function timestamp(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function noteTitle(note: Note): string {
  const title = note.title?.trim();
  if (title) return title;
  const text = extractTextFromNode(note.content).replace(/\s+/g, ' ').trim();
  return text.slice(0, 90) || 'Untitled note';
}

export function indexActionNotes(notes: Note[]): IndexedActionNote[] {
  return notes.map(note => {
    const body = extractTextFromNode(note.content).replace(/\s+/g, ' ').trim();
    const heading = note.title?.trim() || body.slice(0, 90) || 'Untitled note';
    const preview = body && body !== note.title?.trim()
      ? (body.length > 180 ? body.slice(0, 179) + '…' : body)
      : 'No content yet';
    return {
      note, heading, preview,
      searchText: normalize([note.title, body, note.authorName, note.type].join(' ')),
    };
  });
}

export function selectActionNotes(
  indexed: IndexedActionNote[],
  query: string,
  type: ActionNoteTypeFilter,
  sort: ActionNoteSort,
): IndexedActionNote[] {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return indexed.filter(({ note, searchText }) =>
    (type === 'all' || note.type === type) &&
    words.every(word => searchText.includes(word))
  ).sort((a, b) => {
    const left = a.note, right = b.note;
    if (sort === 'title') {
      return a.heading.localeCompare(b.heading, undefined, {sensitivity:'base'}) ||
        right.updatedAt.localeCompare(left.updatedAt);
    }
    const date = sort === 'created' ? 'createdAt' : 'updatedAt';
    const diff = timestamp(right[date]) - timestamp(left[date]);
    return (sort === 'oldest' ? -diff : diff) ||
      a.heading.localeCompare(b.heading, undefined, {sensitivity:'base'}) ||
      left.id.localeCompare(right.id);
  });
}
