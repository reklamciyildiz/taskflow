import { Suspense } from 'react';
import { AuthErrorClient } from './AuthErrorClient';

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  return (
    <Suspense>
      <AuthErrorClient error={searchParams?.error ?? null} />
    </Suspense>
  );
}
