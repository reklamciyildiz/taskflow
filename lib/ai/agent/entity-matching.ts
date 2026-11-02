/**
 * Deterministic, fail-closed name resolution for Actiproc AI.
 * Scope/permissions MUST be filtered by the caller before passing candidates.
 * Never create a record or infer an ID from text; this resolves supplied labels only.
 */
export type EntityMatch<T> =
  | { kind: 'match'; value: T; label: string; mode: 'exact' | 'partial' | 'typo' }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'none'; candidates: string[] };

const ENTITY_SUFFIXES = new Set([
  'process', 'proje', 'project', 'surec', 'sures', 'sürec', 'processin',
  'stage', 'column', 'kolon', 'kolonu', 'kolonunda', 'kolonuna',
  'sutun', 'sutunu', 'sutununda', 'asama', 'asamasinda',
  'action', 'aksiyon', 'task', 'gorev',
]);

export function normalizeAIEntityName(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ıİ]/g, 'i').replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/[şŞ]/g, 's').replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function comparable(value: unknown): string {
  const tokens = normalizeAIEntityName(value).split(' ').filter(Boolean);
  while (tokens.length > 1 && ENTITY_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}

function distance(a: string, b: string): number {
  // Optimal string alignment Damerau-Levenshtein (transpositions count as one).
  // Hard bound: caller only sends short names (up to ~240 chars).
  const prior = Array.from({ length: b.length + 1 }, (_, n) => n);
  let preprior = prior.slice(), previous = prior;
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(row[j-1] + 1, previous[j] + 1,
        previous[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1])
        v = Math.min(v, preprior[j-2] + 1);
      row.push(v);
    }
    preprior = previous;
    previous = row;
  }
  return previous[b.length];
}

function allowedTypoDistance(size: number): number {
  if (size < 5) return 0;
  if (size < 8) return 1;
  if (size < 14) return 2;
  return Math.min(3, Math.floor(size * 0.18));
}

type Candidate<T> = { row: T; label: string; key: string; compact: string };

export function matchAIEntity<T>(
  query: string,
  rows: readonly T[],
  labelOf: (row: T) => string,
): EntityMatch<T> {
  const normalized = comparable(query);
  const entries: Candidate<T>[] = rows.map((row) => {
    const label = labelOf(row);
    const key = comparable(label);
    return { row, label, key, compact: key.replace(/ /g, '') };
  }).filter((item) => Boolean(item.key));
  const candidateNames = (items: Candidate<T>[]) =>
    [...new Set(items.map((item) => item.label))].slice(0, 5);
  if (!normalized) return { kind: 'none', candidates: [] };

  const exact = entries.filter((item) => item.key === normalized);
  if (exact.length === 1) return { kind: 'match', value: exact[0].row, label: exact[0].label, mode: 'exact' };
  if (exact.length > 1) return { kind: 'ambiguous', candidates: candidateNames(exact) };

  // Partial only on whole-word boundaries, with enough specificity to avoid
  // silently selecting "In Progress" for a query like "in" or "pro".
  const partial = normalized.length >= 5
    ? entries.filter((item) => item.key.includes(normalized) &&
      (item.key === normalized || item.key.startsWith(normalized + ' ') ||
        item.key.endsWith(' ' + normalized) || item.key.includes(' ' + normalized + ' ')))
    : [];
  if (partial.length === 1) return { kind: 'match', value: partial[0].row, label: partial[0].label, mode: 'partial' };
  if (partial.length > 1) return { kind: 'ambiguous', candidates: candidateNames(partial) };

  const compact = normalized.replace(/ /g, '');
  const limit = allowedTypoDistance(compact.length);
  if (!limit || compact.length > 160) return { kind: 'none', candidates: candidateNames(entries) };
  const ranked = entries.map((item) => ({
    ...item,
    d: Math.min(distance(normalized, item.key), distance(compact, item.compact)),
  })).sort((a, b) => a.d - b.d || a.label.localeCompare(b.label));
  const eligible = ranked.filter((item) => item.d <= limit);
  if (!eligible.length) return { kind: 'none', candidates: candidateNames(ranked) };
  const winner = eligible[0];
  // A single edit or nearly equally close competitors are NOT safe enough to
  // infer identity. Explicitly ask which canonical record the user meant.
  const close = eligible.filter((item) => item.d <= winner.d + 1);
  if (close.length > 1) return { kind: 'ambiguous', candidates: candidateNames(close) };
  return { kind: 'match', value: winner.row, label: winner.label, mode: 'typo' };
}

/** Extract a stage mentioned immediately before 'kolonu/column/stage' */
export function stageHintFromText(text: string): string | null {
  const cleaned = text.replace(/[“”"']/g, ' ');
  const match = cleaned.match(/([\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+){0,4})\s+(?:kolon(?:un[ad]?|undaki|unda|una|u|da|a)?|s[uü]tun(?:unda|una|u|da|a)?|column|stage|a[sş]ama(?:s[iı]nda|s[iı]na|da|ya)?)\b/iu);
  if (!match) return null;
  return match[1].trim();
}
