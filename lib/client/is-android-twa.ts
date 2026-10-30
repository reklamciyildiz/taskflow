'use client';

/**
 * Returns true if the client is running inside the Actiproc Android TWA.
 * Detection sources:
 * 1. URL search param `app_platform=android-twa` or `platform=android-twa` (injected via LauncherActivity.getLaunchingUrl)
 * 2. document.referrer starting with `android-app://` (standard Chrome TWA referrer)
 * 3. Session storage / cookie persisted during the session.
 */
export function isAndroidTwa(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (sessionStorage.getItem('actiproc_platform') === 'android-twa') {
      return true;
    }

    if (document.cookie.includes('actiproc_platform=android-twa')) {
      return true;
    }

    const params = new URLSearchParams(window.location.search);
    const platformParam = params.get('app_platform') || params.get('platform');
    const isFromUrl = platformParam === 'android-twa';

    const referrer = document.referrer || '';
    const isFromReferrer = referrer.startsWith('android-app://');

    if (isFromUrl || isFromReferrer) {
      sessionStorage.setItem('actiproc_platform', 'android-twa');
      document.cookie = 'actiproc_platform=android-twa; path=/; max-age=31536000; SameSite=Lax';
      return true;
    }
  } catch {
    // Graceful fallback in sandboxed iframes or private browsing
  }

  return false;
}

