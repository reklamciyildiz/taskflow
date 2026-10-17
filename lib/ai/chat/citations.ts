import type { SourceCitation } from '@/lib/ai/retrieval/types';

const CITATION_PATTERN = /\[cite:([0-9a-f]{64})\]/g;

export function citationIdsFromAnswer(answer: string): string[] {
  return [...new Set([...answer.matchAll(CITATION_PATTERN)].map((match) => match[1]))];
}

export function sanitizeAnswerCitations(answer: string, allowedIds: ReadonlySet<string>): string {
  return answer.replace(CITATION_PATTERN, (whole, id: string) => allowedIds.has(id) ? whole : '').replace(/ {2,}/g,' ');
}

export function usedCitations(answer: string, citations: SourceCitation[]): SourceCitation[] {
  const requested = new Set(citationIdsFromAnswer(answer));
  return citations.filter((citation) => requested.has(citation.citationId));
}
