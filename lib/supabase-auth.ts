import { supabaseAdmin } from './supabase-admin';

/**
 * Supabase Auth Helper Functions
 * Integrates NextAuth with Supabase Auth for RLS compatibility
 */

/**
 * Create or update Supabase Auth user
 * This ensures auth.uid() works in RLS policies
 */
export async function createSupabaseAuthUser(
  userId: string,
  email: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if user already exists in Supabase Auth
    const { data: existingUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (getUserError && getUserError.message !== 'User not found') {
      console.error('Error getting Supabase Auth user:', getUserError);
      return { success: false, error: getUserError.message };
    }

    if (existingUser?.user) {
      // User exists, update metadata
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email,
        user_metadata: { name },
      });

      if (updateError) {
        console.error('Error updating Supabase Auth user:', updateError);
        return { success: false, error: updateError.message };
      }

      return { success: true };
    }

    // User doesn't exist, create new auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      id: userId,
      email,
      email_confirm: true, // Auto-confirm email since they logged in via NextAuth
      user_metadata: { name },
    });

    if (createError) {
      console.error('Error creating Supabase Auth user:', createError);
      return { success: false, error: createError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error in createSupabaseAuthUser:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Delete Supabase Auth user
 * Used when user is removed from the system
 */
export async function deleteSupabaseAuthUser(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error('Error deleting Supabase Auth user:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Unexpected error in deleteSupabaseAuthUser:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Generate Supabase Auth session token
 * This token can be used for RLS-protected queries
 */
export async function generateSupabaseAuthToken(userId: string): Promise<{ token?: string; error?: string }> {
  try {
    // Get user from Supabase Auth
    const { data, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (getUserError || !data || !data.user || !data.user.email) {
      console.error('Error getting user for token:', getUserError);
      return { error: getUserError?.message || 'User not found' };
    }

    // Generate session token
    const { data: session, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: data.user.email,
    });

    if (sessionError) {
      console.error('Error generating session token:', sessionError);
      return { error: sessionError.message };
    }

    return { token: session.properties.hashed_token };
  } catch (error) {
    console.error('Unexpected error in generateSupabaseAuthToken:', error);
    return { error: String(error) };
  }
}

/**
 * Sync NextAuth user to Supabase Auth
 * Called during NextAuth callbacks
 */
export async function syncUserToSupabaseAuth(
  userId: string,
  email: string,
  name: string
): Promise<void> {
  const result = await createSupabaseAuthUser(userId, email, name);
  
  if (!result.success) {
    console.error('Failed to sync user to Supabase Auth:', result.error);
    // Don't throw error - allow NextAuth to continue
    // RLS will fall back to service role key in API routes
  }
}
