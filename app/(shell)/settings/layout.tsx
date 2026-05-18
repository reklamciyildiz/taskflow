'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useView } from '@/components/ViewContext';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { toast } from 'sonner';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { setCurrentView } = useView();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCurrentView('settings');
    setMounted(true);
  }, [setCurrentView]);

  // Handle OAuth callback query params (e.g. ?google=connected) at layout level
  // so they resolve regardless of which sub-page triggered the OAuth flow.
  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const flag = url.searchParams.get('google');
    if (!flag) return;

    if (flag === 'connected') toast.success('Google Calendar connected');
    else if (flag === 'unauthorized') toast.error('Google sign-in failed (unauthorized).');
    else if (flag === 'invalid_state') toast.error('Google sign-in failed (invalid state).');
    else if (flag === 'no_refresh_token') toast.error('Google did not return a refresh token. Try disconnect/reconnect with consent.');
    else if (flag === 'db_error') toast.error('Could not save Google connection (database error).');
    else if (flag === 'oauth_error') toast.error('Google OAuth failed.');
    else toast.message(`Google: ${flag}`);

    url.searchParams.delete('google');
    router.replace(`${url.pathname}${url.search || ''}`);
  }, [mounted, router]);

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <SettingsNav />
      <div className="flex-1 min-w-0 p-4 sm:p-6">
        {children}
      </div>
    </div>
  );
}
