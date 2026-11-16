/**
 * Deterministic credential validation shared by the NextAuth adapter and QA.
 * Missing users / passwordless (Google) accounts deliberately produce the same
 * result as an incorrect password; database failures must NEVER be disguised
 * as incorrect credentials.
 */
export type PasswordLoginUser = {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  password_hash?: string | null;
};

export type PasswordLoginIdentity = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

export class PasswordLoginBackendError extends Error {
  constructor(public readonly operation: 'lookup' | 'verify') {
    super('Password login backend unavailable');
    this.name = 'PasswordLoginBackendError';
  }
}

export const PASSWORD_LOGIN_UNAVAILABLE_CODE = 'AuthServiceUnavailable';

export function normalizedLoginEmail(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export async function validatePasswordLogin(
  credentials: { email?: unknown; password?: unknown } | null | undefined,
  deps: {
    findUserByEmail: (email: string) => Promise<PasswordLoginUser | null>;
    verifyPassword: (plain: string, hash: string) => Promise<boolean>;
  },
): Promise<PasswordLoginIdentity | null> {
  const email = normalizedLoginEmail(credentials?.email);
  const password = credentials?.password;
  if (!email || typeof password !== 'string' || password.length === 0) return null;

  let user: PasswordLoginUser | null;
  try {
    user = await deps.findUserByEmail(email);
  } catch {
    throw new PasswordLoginBackendError('lookup');
  }

  // No account, or an account created via Google without a local password.
  // Never disclose which situation applies to a particular email.
  if (!user?.id || !user.email || !user.password_hash) return null;

  let passwordMatches = false;
  try {
    passwordMatches = await deps.verifyPassword(password, user.password_hash);
  } catch {
    throw new PasswordLoginBackendError('verify');
  }
  if (!passwordMatches) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.avatar_url ?? null,
  };
}

/** Separate user-visible messages, but never reveal account existence. */
export function passwordLoginErrorMessage(error: string | null | undefined): string {
  if (error === 'CredentialsSignin') {
    return 'Email or password is incorrect. If you registered with Google, use Continue with Google.';
  }
  if (error === PASSWORD_LOGIN_UNAVAILABLE_CODE) {
    return 'Sign-in is temporarily unavailable. Please try again shortly.';
  }
  if (error === 'OAuthAccountNotLinked') {
    return 'This email is already associated with another sign-in method.';
  }
  return 'We could not sign you in. Please try again.';
}

/** Never hand untrusted callbackUrl query parameters directly to router.push. */
export function safeAuthCallbackPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') ||
      raw.startsWith('//') || raw.includes('\\') || /[\x00-\x1f\x7f]/.test(raw)) return '/';
  try {
    const parsed = new URL(raw, 'https://actiproc.invalid');
    if (parsed.origin !== 'https://actiproc.invalid') return '/';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return '/';
  }
}
