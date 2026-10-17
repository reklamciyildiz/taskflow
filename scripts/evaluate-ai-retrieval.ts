import { performance } from 'node:perf_hooks';
import { rankingMetrics, reciprocalRankFusion } from '../lib/ai/retrieval/ranking';

type Case = {
  id: string;
  relevant: string[];
  authorized: string[];
  keyword: string[];
  semantic: string[];
};

const cases: Case[] = [
  {
    id: 'tr-vector-index',
    relevant: ['vector-foundation','hybrid-design'],
    authorized: ['vector-foundation','hybrid-design','unrelated'],
    keyword: ['private-secret','vector-foundation','hybrid-design','unrelated'],
    semantic: ['private-secret','hybrid-design','vector-foundation','unrelated'],
  },
  {
    id: 'en-lease-recovery',
    relevant: ['durable-jobs'],
    authorized: ['durable-jobs','hybrid-design','other','unrelated'],
    keyword: ['private-secret','unrelated','durable-jobs','other'],
    semantic: ['private-secret','durable-jobs','hybrid-design','other'],
  },
  {
    id: 'mixed-r2-term',
    relevant: ['r2-content-length'],
    authorized: ['r2-content-length','other','unrelated'],
    keyword: ['private-secret','r2-content-length','other','unrelated'],
    semantic: ['private-secret','other','r2-content-length','unrelated'],
  },
];

const k = 3;
const aggregate = (mode: 'keyword' | 'semantic' | 'hybrid') => {
  const startedAt = performance.now();
  let unauthorizedRetrievalCount = 0;
  const metrics = cases.map((testCase) => {
    const authorized = new Set(testCase.authorized);
    const keyword = testCase.keyword.filter((id) => authorized.has(id));
    const semantic = testCase.semantic.filter((id) => authorized.has(id));
    const ranked = mode === 'keyword'
      ? keyword
      : mode === 'semantic'
        ? semantic
        : reciprocalRankFusion(semantic,keyword).map((item) => item.id);
    unauthorizedRetrievalCount += ranked.filter((id) => !authorized.has(id)).length;
    return rankingMetrics(ranked,new Set(testCase.relevant),k);
  });
  const average = (key: keyof typeof metrics[number]) => metrics.reduce((sum,item) => sum+item[key],0)/metrics.length;
  return {
    recallAtK: average('recallAtK'),precisionAtK: average('precisionAtK'),
    mrr: average('mrr'),ndcgAtK: average('ndcgAtK'),
    unauthorizedRetrievalCount,
    latencyMs: Number((performance.now()-startedAt).toFixed(3)),
  };
};

console.log(JSON.stringify({
  dataset: 'synthetic-tr-en-mixed-v1',cases: cases.length,k,
  keyword: aggregate('keyword'),semantic: aggregate('semantic'),hybrid: aggregate('hybrid'),
  productionData: false,liveDatabase: false,liveEmbeddingCalls: false,
},null,2));
