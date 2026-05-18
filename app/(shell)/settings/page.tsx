'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Client redirect so the layout's OAuth callback handler (?google=...) runs
// before navigation and can parse any query params returned by Google OAuth.
export default function SettingsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings/profile');
  }, [router]);
  return null;
}
