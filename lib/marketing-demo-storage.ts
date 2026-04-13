/** Browser-only persistence for the /marketing interactive demo (no API). */

export const MARKETING_DEMO_STORAGE_KEY = 'taskflow-marketing-demo-v1';

export type MarketingDemoCheckItem = { id: string; text: string; done: boolean };

export type MarketingDemoCard = {
  id: string;
  title: string;
  items: MarketingDemoCheckItem[];
};

function isCheckItem(x: unknown): x is MarketingDemoCheckItem {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.text === 'string' &&
    typeof o.done === 'boolean'
  );
}

function isCard(x: unknown): x is MarketingDemoCard {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.title !== 'string' || !Array.isArray(o.items)) {
    return false;
  }
  return o.items.every(isCheckItem);
}

export function parseMarketingDemoCards(raw: string | null): MarketingDemoCard[] | null {
  if (raw == null || raw === '') return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || !data.every(isCard)) return null;
    return data;
  } catch {
    return null;
  }
}

export function stringifyMarketingDemoCards(cards: MarketingDemoCard[]): string {
  return JSON.stringify(cards);
}
