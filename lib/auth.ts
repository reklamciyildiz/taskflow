import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { syncUserToSupabaseAuth } from '@/lib/supabase-auth';
import bcrypt from 'bcryptjs';

// Lazy import - only load at runtime
function getUserDb() {
  return require('@/lib/db').userDb;
}

// ---------------------------------------------------------------------------
// Process-level cache + in-flight coalescing for the JWT callback user lookup.
//
// getServerSession() runs the `jwt` callback on EVERY authenticated API request,
// but it never persists the mutated token back to a cookie (there is no Set-Cookie
// on a read). That means the token-based freshness fields (dbSyncAt / dbSyncFailAt)
// were dead code for reads — every request re-hit the database AND re-ran the heavy
// Supabase Auth admin sync. On dashboard mount / tab refocus the client fires a burst
// of ~6-8 concurrent requests, so this produced a thundering herd against Supabase
// (intermittent 500s + slow "cold" first paint that self-heals seconds later).
//
// A module-scoped cache makes the intended ~5 min freshness actually work and collapses
// the concurrent burst into a single DB read per email.
// ---------------------------------------------------------------------------
type CachedTokenUser = { user: any; at: number };
const TOKEN_USER_TTL_MS = 5 * 60_000;
const tokenUserCache = new Map<string, CachedTokenUser>();
const tokenUserInflight = new Map<string, Promise<any>>();

async function loadUserForToken(email: string, forceFresh: boolean): Promise<any> {
  if (!forceFresh) {
    const cached = tokenUserCache.get(email);
    if (cached && Date.now() - cached.at < TOKEN_USER_TTL_MS) {
      return cached.user;
    }
  }

  // Coalesce concurrent lookups for the same email into a single DB round-trip.
  let inflight = tokenUserInflight.get(email);
  if (!inflight) {
    const userDb = getUserDb();
    inflight = Promise.resolve(userDb.getByEmail(email))
      .then((u: any) => {
        tokenUserCache.set(email, { user: u, at: Date.now() });
        return u;
      })
      .finally(() => {
        tokenUserInflight.delete(email);
      });
    tokenUserInflight.set(email, inflight);
  }
  return inflight;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const userDb = getUserDb();
          const user: any = await userDb.getByEmail(credentials.email);
          
          if (user && typeof user.password_hash === 'string' && user.password_hash.length > 0) {
            const ok = await bcrypt.compare(credentials.password, user.password_hash);
            if (!ok) return null;
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.avatar_url,
            };
          }

          return null;
        } catch (error) {
          console.error('Auth error:', error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
    newUser: '/onboarding', // Redirect new users to onboarding
  },
  callbacks: {
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }

      // Keep organization info fresh so security-relevant changes (e.g. user removed from
      // an org) propagate into the token. This runs on every getServerSession() read, so it
      // is served from a short-lived process cache to avoid a per-request DB/Auth stampede.
      if (token.email) {
        const email = token.email as string;

        // After join-org / create-org, session.update() must see DB immediately, and on a
        // real sign-in we (re)issue the token — bypass the cache for those.
        const forceDbSync =
          trigger === 'update' ||
          trigger === 'signIn' ||
          Boolean(user);

        const hasSupabaseEnv =
          Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
          Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
          process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co' &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'placeholder-key';

        if (hasSupabaseEnv) {
          try {
            const dbUser: any = await loadUserForToken(email, forceDbSync);

            if (dbUser) {
              token.id = dbUser.id;
              token.organizationId = dbUser.organization_id ?? null;
              token.role = dbUser.role;
              // Row exists but no org → still needs onboarding / invite join
              token.needsOnboarding = !dbUser.organization_id;

              // Supabase Auth sync issues heavy admin API calls (getUserById + create/update).
              // Only run it when the token is actually (re)issued — sign-in or an explicit
              // session.update() — never on ordinary reads, which caused the request-burst
              // 500s. All data access uses the service-role client, so RLS does not depend
              // on this running on every request.
              if (forceDbSync) {
                await syncUserToSupabaseAuth(
                  dbUser.id,
                  email,
                  (token.name as string) || 'User'
                );
              }
            } else {
              token.needsOnboarding = true;
              token.organizationId = null;
            }
          } catch (error: any) {
            if (process.env.NODE_ENV !== 'production') {
              const msg = typeof error?.message === 'string' ? error.message : String(error);
              console.error('Error fetching user from DB:', msg);
            }
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).accessToken = token.accessToken;
        (session.user as any).provider = token.provider;
        (session.user as any).organizationId = token.organizationId;
        (session.user as any).role = token.role;
        (session.user as any).needsOnboarding = token.needsOnboarding;
      }
      return session;
    },
    async signIn({ user, account }) {
      // Allow all sign-ins - onboarding will handle new user setup
      if (!user.email) return false;
      return true;
    },
    async redirect({ url, baseUrl }) {
      // Handle redirect after sign in
      if (url.startsWith(baseUrl)) return url;
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      return baseUrl;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'build-time-placeholder-secret',
  debug: process.env.NODE_ENV === 'development',
};
