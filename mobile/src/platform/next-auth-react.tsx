import type { ReactNode } from 'react';

export function useSession() {
  return { data: null, status: 'unauthenticated', update: async () => null } as const;
}

export function SessionProvider({ children }: { children: ReactNode }) { return children; }
export async function signIn() { return undefined; }
export async function signOut() { return undefined; }
