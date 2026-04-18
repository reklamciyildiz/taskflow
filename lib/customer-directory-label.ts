/** UI labels for the customer directory (route stays `/customers`; only copy changes). */

export const DEFAULT_CUSTOMER_DIRECTORY_LABEL = 'Customers';
export const DEFAULT_CUSTOMER_SINGULAR_LABEL = 'Customer';

const MAX_LEN = 48;

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function sanitizeCustomerDirectoryLabel(input: string): string {
  const t = collapseWs(input).slice(0, MAX_LEN);
  return t.length > 0 ? t : DEFAULT_CUSTOMER_DIRECTORY_LABEL;
}

export function sanitizeCustomerSingularLabel(input: string): string {
  const t = collapseWs(input).slice(0, MAX_LEN);
  return t.length > 0 ? t : DEFAULT_CUSTOMER_SINGULAR_LABEL;
}

export type CustomerTerminology = {
  directory: string;
  singular: string;
};

function storageKey(organizationId: string): string {
  return `taskflow:customerTerminology:${organizationId}`;
}

export function readCustomerTerminology(organizationId: string | null): CustomerTerminology {
  if (!organizationId || typeof window === 'undefined') {
    return {
      directory: DEFAULT_CUSTOMER_DIRECTORY_LABEL,
      singular: DEFAULT_CUSTOMER_SINGULAR_LABEL,
    };
  }
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId));
    if (!raw) {
      return {
        directory: DEFAULT_CUSTOMER_DIRECTORY_LABEL,
        singular: DEFAULT_CUSTOMER_SINGULAR_LABEL,
      };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {
        directory: DEFAULT_CUSTOMER_DIRECTORY_LABEL,
        singular: DEFAULT_CUSTOMER_SINGULAR_LABEL,
      };
    }
    const o = parsed as Record<string, unknown>;
    const directory =
      typeof o.directory === 'string'
        ? sanitizeCustomerDirectoryLabel(o.directory)
        : DEFAULT_CUSTOMER_DIRECTORY_LABEL;
    const singular =
      typeof o.singular === 'string'
        ? sanitizeCustomerSingularLabel(o.singular)
        : DEFAULT_CUSTOMER_SINGULAR_LABEL;
    return { directory, singular };
  } catch {
    return {
      directory: DEFAULT_CUSTOMER_DIRECTORY_LABEL,
      singular: DEFAULT_CUSTOMER_SINGULAR_LABEL,
    };
  }
}

export function writeCustomerTerminology(organizationId: string, next: CustomerTerminology): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(organizationId), JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}
