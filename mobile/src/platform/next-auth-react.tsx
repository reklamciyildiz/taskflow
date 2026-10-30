import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MobileSessionTokens } from '../../../shared/mobile-contracts';
import { getActiveSession, subscribeSession } from '../mobile-api';

export type NextAuthSession = {
  user: {
    id: string;
    email: string;
    name?: string | null;
    role?: string;
    organization_id?: string | null;
    image?: string | null;
  };
  expires: string;
};

export type SessionContextValue =
  | { data: NextAuthSession; status: 'authenticated'; update: (data?: any) => Promise<NextAuthSession | null> }
  | { data: null; status: 'unauthenticated'; update: (data?: any) => Promise<null> }
  | { data: null; status: 'loading'; update: (data?: any) => Promise<null> };

function toNextAuthSession(tokens: MobileSessionTokens | null): SessionContextValue {
  if (!tokens?.user?.email) {
    return { data: null, status: 'unauthenticated', update: async () => null };
  }
  return {
    data: {
      user: {
        id: String(tokens.user.id || 'mobile-user'),
        email: tokens.user.email,
        name: tokens.user.name || null,
        role: tokens.user.role || 'member',
        organization_id: tokens.user.organizationId || null,
        image: tokens.user.avatarUrl || null,
      },
      expires: tokens.accessTokenExpiresAt || new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    status: 'authenticated',
    update: async () => null,
  };
}

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: 'loading',
  update: async () => null,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionContextValue>(() => toNextAuthSession(getActiveSession()));

  useEffect(() => {
    setSession(toNextAuthSession(getActiveSession()));
    return subscribeSession((tokens) => {
      setSession(toNextAuthSession(tokens));
    });
  }, []);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx || ctx.status === 'loading') {
    const current = getActiveSession();
    if (current) return toNextAuthSession(current);
  }
  return ctx;
}

export async function signIn() { return undefined; }
export async function signOut() { return undefined; }
