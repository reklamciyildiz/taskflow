import { config } from 'dotenv';
import { aiBetaOrganizationIds,isAIBetaModeEnabled } from '../lib/ai/beta-access';

config({ path: '.env.local', quiet: true });

type Source = 'task' | 'note' | 'process';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main() {
  const source = (argument('source') ?? 'task') as Source;
  if (!['task','note','process'].includes(source)) {
    throw new Error('Use --source=task, note, or process');
  }
  const limit = Math.max(1, Math.min(200, Number(argument('limit') ?? 50) || 50));
  const cursor = argument('cursor');
  const enqueue = process.argv.includes('--enqueue');
  const organizationId = argument('organization-id');
  const projectIds = [...new Set((process.env.AI_INDEX_PROJECT_IDS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean))];
  if (!organizationId || !UUID_PATTERN.test(organizationId)
      || projectIds.length < 1 || projectIds.length > 100
      || projectIds.some((value) => !UUID_PATTERN.test(value))) {
    throw new Error('A valid --organization-id and AI_INDEX_PROJECT_IDS scope are required');
  }
  if (enqueue && process.env.AI_INDEX_BACKFILL_ENABLED !== 'true') {
    throw new Error('Refusing enqueue: AI_INDEX_BACKFILL_ENABLED must be true');
  }
  if (enqueue && argument('confirm') !== 'enqueue-production-ai-backfill') {
    throw new Error('Refusing enqueue: explicit production backfill confirmation is required');
  }
  const betaMode = isAIBetaModeEnabled();
  const betaOrganizationIds = betaMode ? aiBetaOrganizationIds() : [];
  if (betaMode && betaOrganizationIds.length === 0) {
    throw new Error('Refusing backfill: AXIOM_AI_BETA_ORGANIZATION_IDS is empty');
  }
  if (!betaMode || !betaOrganizationIds.includes(organizationId)) {
    throw new Error('Refusing backfill: organization is outside the configured beta scope');
  }
  const { supabaseAdmin } = await import('../lib/supabase-admin');
  const table = source === 'task' ? 'tasks' : source === 'note' ? 'notes' : 'projects';
  const columns = source === 'note'
    ? 'id,organization_id,team_id,task_id'
    : source === 'process'
        ? 'id,organization_id,team_id'
        : 'id,organization_id,team_id,project_id';
  let query = supabaseAdmin.from(table).select(columns).eq('organization_id', organizationId)
    .order('id', { ascending: true }).limit(limit);
  if (source === 'process') query = query.in('id', projectIds);
  if (source === 'task') query = query.in('project_id', projectIds);
  if (cursor) query = query.gt('id', cursor);
  const { data, error } = await query;
  if (error) throw error;
  const pageRows = data ?? [];
  const taskIds = [...new Set(pageRows.map((row: any) => row.task_id).filter(Boolean))];
  const projectByTask = new Map<string, string | null>();
  if (taskIds.length) {
    const { data: tasks, error: taskError } = await supabaseAdmin.from('tasks')
      .select('id,project_id').in('id', taskIds);
    if (taskError) throw taskError;
    for (const task of tasks ?? []) projectByTask.set(String(task.id), task.project_id ? String(task.project_id) : null);
  }
  const rows = source === 'note'
    ? pageRows.filter((row: any) => projectIds.includes(projectByTask.get(String(row.task_id)) ?? ''))
    : pageRows;
  if (enqueue) {
    for (const row of rows as any[]) {
      const sourceType = source;
      const projectId = source === 'process'
        ? String(row.id)
        : source === 'task'
          ? row.project_id ?? null
          : projectByTask.get(String(row.task_id)) ?? null;
      if (!projectId || !projectIds.includes(String(projectId))) {
        throw new Error('Refusing enqueue: canonical source escaped the configured Process scope');
      }
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
    excludedByProcessScope: pageRows.length - rows.length,
    nextCursor: pageRows.length ? String((pageRows.at(-1) as any).id) : null,
    hasMore: pageRows.length === limit,
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'AI index backfill failed');
  process.exitCode = 1;
});
