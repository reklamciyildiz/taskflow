import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validateStageConfig } from '@/lib/stage-lifecycle';
import type { ProjectColumnConfig } from '@/lib/types';

export type InboxBoardSnapshot =
  | { configured: true; available: true; stages: ProjectColumnConfig[]; version: number }
  | { configured: false; available: boolean; stages: null; version: 0 };

export function inboxBoardTableMissing(error: { code?: string; message?: string } | null): boolean {
  return !!error && (['42P01', 'PGRST205', 'PGRST204'].includes(error.code ?? '')
    || /team_inbox_boards.*(not found|does not exist)/i.test(error.message ?? ''));
}

export async function readInboxBoard(teamId: string): Promise<InboxBoardSnapshot> {
  const { data, error } = await supabaseAdmin.from('team_inbox_boards')
    .select('stages,version').eq('team_id', teamId).maybeSingle();
  if (inboxBoardTableMissing(error)) return { configured: false, available: false, stages: null, version: 0 };
  if (error) throw error;
  if (!data) return { configured: false, available: true, stages: null, version: 0 };
  // Validate before exposing server configuration. Never silently substitute default IDs.
  return { configured: true, available: true, stages: validateStageConfig(data.stages), version: Number(data.version) };
}
