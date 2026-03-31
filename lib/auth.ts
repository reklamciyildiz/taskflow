import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { syncUserToSupabaseAuth } from '@/lib/supabase-auth';

// Lazy import - only load at runtime
function getUserDb() {
  return require('@/lib/db').userDb;
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
          
          if (user) {
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
      
      // Always fetch fresh user data from Supabase to ensure organization info is up-to-date
      // This is critical for security - when a user is removed from organization, token should reflect this
      if (token.email) {
        const now = Date.now();
        const t: any = token as any;
        const lastSyncAt = typeof t.dbSyncAt === 'number' ? t.dbSyncAt : 0;
        const lastFailAt = typeof t.dbSyncFailAt === 'number' ? t.dbSyncFailAt : 0;

        // Avoid hammering the DB on every JWT callback invocation.
        // - Successful sync: cache for 5 minutes
        // - Failed sync: back off for 60 seconds
        const shouldBackoff = lastFailAt > 0 && now - lastFailAt < 60_000;
        const isFresh = lastSyncAt > 0 && now - lastSyncAt < 5 * 60_000;

        const hasSupabaseEnv =
          Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
          Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
          process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co' &&
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'placeholder-key';

        if (!shouldBackoff && !isFresh && hasSupabaseEnv) {
          try {
            const userDb = getUserDb();
            const dbUser: any = await userDb.getByEmail(token.email as string);
            t.dbSyncAt = now;
            t.dbSyncFailAt = 0;

            if (dbUser) {
              token.id = dbUser.id;
              token.organizationId = dbUser.organization_id; // Now properly nullable
              token.role = dbUser.role;
              token.needsOnboarding = false;

              // Sync user to Supabase Auth for RLS compatibility
              // This ensures auth.uid() works in RLS policies
              await syncUserToSupabaseAuth(
                dbUser.id,
                token.email as string,
                token.name as string || 'User'
              );
            } else {
              // User not in database - needs onboarding
              token.needsOnboarding = true;
              token.organizationId = null;
            }
          } catch (error: any) {
            // Professional behavior: don't break auth/session on transient network issues.
            // Keep prior token fields; just back off and log a compact message.
            t.dbSyncFailAt = now;
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
