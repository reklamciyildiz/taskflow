import type { SourceCitation } from './types';

/** Future answer generation may cite only ids in this immutable registry. */
export function createCitationRegistry(citations: SourceCitation[]) {
  const byId = new Map(citations.map((citation) => [citation.citationId, citation] as const));
  return {
    ids: Object.freeze([...byId.keys()]),
    resolve(citationId: string): SourceCitation | null {
      return byId.get(citationId) ?? null;
    },
    validate(citationIds: string[]): SourceCitation[] {
      const unique = [...new Set(citationIds)];
      const resolved = unique.map((id) => byId.get(id));
      if (resolved.some((citation) => !citation)) {
        throw new Error('Answer referenced a citation outside the verified retrieval context');
      }
      return resolved as SourceCitation[];
    },
  };
}
