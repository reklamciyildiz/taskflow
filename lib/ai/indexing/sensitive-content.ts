const DETECTORS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'private_key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i },
  { code: 'bearer_token', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i },
  { code: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { code: 'aws_access_key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { code: 'github_token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { code: 'provider_api_key', pattern: /\b(?:gsk_|sk-(?:proj-)?|sk_live_|rk_live_)[A-Za-z0-9_-]{16,}\b/ },
  { code: 'google_api_key', pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/ },
  { code: 'credential_url', pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]{4,}@/i },
  {
    code: 'credential_assignment',
    pattern: /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret)\b\s*[:=]\s*["']?(?!example\b|placeholder\b|your[-_ ]|test\b|x{4,}\b)[A-Za-z0-9._~+/=-]{12,}/i,
  },
];

export function sensitiveContentCategories(text: string): string[] {
  return DETECTORS.filter(({ pattern }) => pattern.test(text)).map(({ code }) => code);
}

export class SensitiveAIContentError extends Error {
  readonly categories: string[];

  constructor(categories: string[]) {
    super('Potential credential or secret detected; AI indexing was blocked');
    this.name = 'SensitiveAIContentError';
    this.categories = [...new Set(categories)].sort();
  }
}

export function assertNoSensitiveAIContent(texts: string[]) {
  const categories = [...new Set(texts.flatMap(sensitiveContentCategories))];
  if (categories.length) throw new SensitiveAIContentError(categories);
}
