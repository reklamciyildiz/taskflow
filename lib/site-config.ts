// Centralized public-facing site config. Read from env so legal pages don't
// hardcode the hosting URL — switching domains is a one-line env change.

const FALLBACK_URL = 'https://www.actiproc.com';
const FALLBACK_CONTACT = 'support@actiproc.com';

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export const APP_NAME = 'Actiproc';

export const APP_URL = stripTrailingSlash(
  process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || FALLBACK_URL
);

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || FALLBACK_CONTACT;

// Bumped whenever the Privacy Policy or Terms of Service change materially.
export const LEGAL_LAST_UPDATED = 'May 20, 2026';
