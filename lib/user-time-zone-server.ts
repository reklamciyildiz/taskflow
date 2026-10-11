import { supabaseAdmin } from '@/lib/supabase-admin';

export function normalizeIanaTimeZone(value: unknown): string | null {
  const timeZone = typeof value === 'string' ? value.trim() : '';
  if (!timeZone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return timeZone;
  } catch {
    return null;
  }
}

/** Fill an absent preference without ever overwriting a user-selected time zone. */
export async function captureMissingUserTimeZone(userId: string, value: unknown): Promise<boolean> {
  const timeZone = normalizeIanaTimeZone(value);
  if (!timeZone) return false;
  const updatedAt = new Date().toISOString();
  const { data: existing, error } = await supabaseAdmin
    .from('user_settings')
    .select('user_id,time_zone')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const existingValue = (existing as { time_zone?: unknown } | null)?.time_zone;
  if (normalizeIanaTimeZone(existingValue)) return false;

  if (existing) {
    let update = supabaseAdmin
      .from('user_settings')
      .update({ time_zone: timeZone, updated_at: updatedAt })
      .eq('user_id', userId);
    update = existingValue == null
      ? update.is('time_zone', null)
      : update.eq('time_zone', String(existingValue));
    const { data, error: updateError } = await update.select('user_id').maybeSingle();
    if (updateError) throw updateError;
    return Boolean(data);
  }

  const { error: insertError } = await supabaseAdmin
    .from('user_settings')
    .insert({ user_id: userId, time_zone: timeZone, updated_at: updatedAt });
  if (!insertError) return true;
  // A concurrent request or an existing non-null preference wins.
  if ((insertError as { code?: string }).code === '23505') return false;
  throw insertError;
}
