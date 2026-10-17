import { config } from 'dotenv';
import { aiBetaOrganizationIds,isAIBetaModeEnabled } from '../lib/ai/beta-access';

config({ path: '.env.local', quiet: true });

type Source = 'task' | 'note' | 'process' | 'attachment';

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const source = (argument('source') ?? 'task') as Source;
  if (!['task','note','process','attachment'].includes(source)) {
    throw new Error('Use --source=task, note, process, or attachment');
  }
  const limit = Math.max(1, Math.min(200, Number(argument('limit') ?? 50) || 50));
  const cursor = argument('cursor');
  const enqueue = process.argv.includes('--enqueue');
  if (enqueue && process.env.AI_INDEX_BACKFILL_ENABLED !== 'true') {
    throw new Error('Refusing enqueue: AI_INDEX_BACKFILL_ENABLED must be true');
  }
  const betaMode = isAIBetaModeEnabled();
  const betaOrganizationIds = betaMode ? aiBetaOrganizationIds() : [];
  if (betaMode && betaOrganizationIds.length === 0) {
    throw new Error('Refusing backfill: AXIOM_AI_BETA_ORGANIZATION_IDS is empty');
  }
  const { supabaseAdmin } = await import('../lib/supabase-admin');
  const table = source === 'task' ? 'tasks' : source === 'note' ? 'notes' : source === 'process' ? 'projects' : 'attachments';
  const columns = source === 'note'
    ? 'id,organization_id,team_id,task_id'
    : source === 'attachment'
      ? 'id,organization_id,team_id,task_id,status'
      : source === 'process'
        ? 'id,organization_id,team_id'
        : 'id,organization_id,team_id,project_id';
  let query = supabaseAdmin.from(table).select(columns).order('id', { ascending: true }).limit(limit);
  if (betaMode) query = query.in('organization_id', betaOrganizationIds);
  if (cursor) query = query.gt('id', cursor);
  if (source === 'attachment') query = query.eq('status', 'ready');
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const taskIds = [...new Set(rows.map((row: any) => row.task_id).filter(Boolean))];
  const projectByTask = new Map<string, string | null>();
  if (taskIds.length) {
    const { data: tasks, error: taskError } = await supabaseAdmin.from('tasks')
      .select('id,project_id').in('id', taskIds);
    if (taskError) throw taskError;
    for (const task of tasks ?? []) projectByTask.set(String(task.id), task.project_id ? String(task.project_id) : null);
  }
  if (enqueue) {
    for (const row of rows as any[]) {
      const sourceType = source;
      const projectId = source === 'process'
        ? String(row.id)
        : source === 'task'
          ? row.project_id ?? null
          : projectByTask.get(String(row.task_id)) ?? null;
      const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_ai_index_job', {
        p_source_type: sourceType,
        p_source_key: String(row.id),
        p_operation: 'upsert',
        p_organization_id: row.organization_id,
        p_team_id: row.team_id ?? null,
        p_project_id: projectId,
      });
      if (enqueueError) throw enqueueError;
    }
  }
  console.log(JSON.stringify({
    mode: enqueue ? 'enqueue' : 'dry-run', source, count: rows.length,
    nextCursor: rows.length ? String((rows.at(-1) as any).id) : null,
    hasMore: rows.length === limit,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'AI index backfill failed');
  process.exitCode = 1;
});
