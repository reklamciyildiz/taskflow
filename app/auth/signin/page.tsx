import { Suspense } from 'react';
import { SignInClient } from './SignInClient';

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string; error?: string };
}) {
  const callbackUrl = searchParams?.callbackUrl || '/';
  const error = searchParams?.error ?? null;

  // Prevent static generation bailout warnings from `useSearchParams` in a Client Page.
  // We keep the UI as a Client component, but read query params server-side.
  return (
    <Suspense>
      <SignInClient callbackUrl={callbackUrl} error={error} />
    </Suspense>
  );
}
