export type RankedCandidate = {
  id: string;
  semanticRank?: number;
  keywordRank?: number;
};

export function reciprocalRankFusion(
  semanticIds: string[],
  keywordIds: string[],
  options: { k?: number; semanticWeight?: number; keywordWeight?: number } = {},
): Array<RankedCandidate & { score: number }> {
  const k = options.k ?? 60;
  const semanticWeight = options.semanticWeight ?? 1;
  const keywordWeight = options.keywordWeight ?? 1;
  if (!Number.isFinite(k) || k < 1) throw new Error('RRF k must be positive');
  const candidates = new Map<string, RankedCandidate & { score: number }>();
  semanticIds.forEach((id, index) => {
    const rank = index + 1;
    candidates.set(id, { id, semanticRank: rank, score: semanticWeight / (k + rank) });
  });
  keywordIds.forEach((id, index) => {
    const rank = index + 1;
    const existing = candidates.get(id) ?? { id, score: 0 };
    existing.keywordRank = rank;
    existing.score += keywordWeight / (k + rank);
    candidates.set(id, existing);
  });
  return [...candidates.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function deduplicateBySource<T>(
  rows: T[],
  sourceKey: (row: T) => string,
  maxPerSource = 1,
): T[] {
  if (!Number.isInteger(maxPerSource) || maxPerSource < 1 || maxPerSource > 5) {
    throw new Error('maxPerSource must be between 1 and 5');
  }
  const counts = new Map<string, number>();
  return rows.filter((row) => {
    const key = sourceKey(row);
    const count = counts.get(key) ?? 0;
    if (count >= maxPerSource) return false;
    counts.set(key, count + 1);
    return true;
  });
}

export function rankingMetrics(rankedIds: string[], relevantIds: Set<string>, k: number) {
  const top = rankedIds.slice(0, k);
  const relevantRetrieved = top.filter((id) => relevantIds.has(id));
  const reciprocalRank = (() => {
    const index = rankedIds.findIndex((id) => relevantIds.has(id));
    return index < 0 ? 0 : 1 / (index + 1);
  })();
  let dcg = 0;
  top.forEach((id, index) => {
    if (relevantIds.has(id)) dcg += 1 / Math.log2(index + 2);
  });
  let idealDcg = 0;
  for (let index = 0; index < Math.min(k, relevantIds.size); index += 1) {
    idealDcg += 1 / Math.log2(index + 2);
  }
  return {
    recallAtK: relevantIds.size ? relevantRetrieved.length / relevantIds.size : 1,
    precisionAtK: k ? relevantRetrieved.length / k : 0,
    mrr: reciprocalRank,
    ndcgAtK: idealDcg ? dcg / idealDcg : 1,
  };
}
