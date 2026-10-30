import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { userDb } from '@/lib/db';
import { mobileUserAllowed, MobileAuthError } from './server';

const GOOGLE_PROVIDER = 'google';

type BindingResult = 'bound' | 'already_bound' | 'user_not_found' | 'not_eligible' | 'conflict';

/**
 * Bootstrap a canonical Google identity only from NextAuth's verified Google
 * provider callback or verified Google ID token.
 */
export async function bindVerifiedGoogleIdentity(
  email: string,
  providerSubject: string,
): Promise<BindingResult> {
  if (!email || !providerSubject) return 'conflict';

  const user: any = await userDb.getByEmail(email.trim().toLowerCase());
  if (!user?.id) return 'user_not_found';
  if (!mobileUserAllowed(String(user.id))) return 'not_eligible';

  const { data: bySubject, error: subjectError } = await supabaseAdmin
    .from('mobile_auth_provider_identities')
    .select('user_id')
    .eq('provider', GOOGLE_PROVIDER)
    .eq('provider_subject', providerSubject)
    .maybeSingle();
  if (subjectError) throw subjectError;
  if (bySubject) return String(bySubject.user_id) === String(user.id) ? 'already_bound' : 'conflict';

  const { data: byUser, error: userError } = await supabaseAdmin
    .from('mobile_auth_provider_identities')
    .select('provider_subject')
    .eq('provider', GOOGLE_PROVIDER)
    .eq('user_id', user.id)
    .maybeSingle();
  if (userError) throw userError;
  if (byUser) return byUser.provider_subject === providerSubject ? 'already_bound' : 'conflict';

  const { error: insertError } = await supabaseAdmin
    .from('mobile_auth_provider_identities')
    .insert({ provider: GOOGLE_PROVIDER, provider_subject: providerSubject, user_id: user.id });
  if (!insertError) return 'bound';

  // A concurrent verified sign-in may have won the unique insert race.
  const { data: raced, error: racedError } = await supabaseAdmin
    .from('mobile_auth_provider_identities')
    .select('user_id,provider_subject')
    .eq('provider', GOOGLE_PROVIDER)
    .eq('user_id', user.id)
    .maybeSingle();
  if (racedError) throw insertError;
  return raced?.provider_subject === providerSubject && String(raced.user_id) === String(user.id)
    ? 'already_bound'
    : 'conflict';
}

export async function requireVerifiedGoogleIdentity(
  providerSubject: string,
  verifiedEmail: string,
): Promise<any> {
  const { data: identity, error } = await supabaseAdmin
    .from('mobile_auth_provider_identities')
    .select('user_id')
    .eq('provider', GOOGLE_PROVIDER)
    .eq('provider_subject', providerSubject)
    .maybeSingle();
  if (error) throw error;
  if (!identity?.user_id) {
    const user: any = await userDb.getByEmail(verifiedEmail.trim().toLowerCase());
    if (user?.id) {
      const binding = await bindVerifiedGoogleIdentity(verifiedEmail, providerSubject);
      if (binding === 'bound' || binding === 'already_bound') {
        return user;
      }
    }
    throw new MobileAuthError(
      'GOOGLE_IDENTITY_NOT_LINKED',
      403,
      'Sign in to the Actiproc web app with Google once, then try again.',
    );
  }

  const user: any = await userDb.getById(String(identity.user_id));
  if (!user?.id || String(user.email).toLowerCase() !== verifiedEmail.trim().toLowerCase()) {
    throw new MobileAuthError('GOOGLE_IDENTITY_MISMATCH', 403, 'Google identity does not match the linked Actiproc account.');
  }
  return user;
}
