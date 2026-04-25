import type { Project, Team } from '@/lib/types';

const INBOX_NAMES = new Set(['inbox', 'gelen kutusu', 'gel kutusu']);

export type InboxProjectResult =
  | { ok: true; projectId: string }
  | {
      ok: false;
      error: string;
      status?: number;
      code?: string;
      recommendedPlan?: 'pro' | 'team';
    };

export function findInboxProject(projects: Project[], team: Team | null): Project | undefined {
  if (!team) return undefined;
  return projects.find((p) => {
    const name = p.name.trim().toLowerCase();
    if (!INBOX_NAMES.has(name)) return false;
    return !p.teamId || p.teamId === team.id;
  });
}

export async function ensureInboxProjectId(options: {
  projects: Project[];
  currentTeam: Team | null;
  organizationId: string | null;
}): Promise<InboxProjectResult> {
  const { projects, currentTeam, organizationId } = options;
  if (!currentTeam || !organizationId) {
    return { ok: false, error: 'Organization is not available yet.' };
  }
  const existing = findInboxProject(projects, currentTeam);
  if (existing) return { ok: true, projectId: existing.id };

  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Inbox',
      teamId: currentTeam.id,
      organizationId,
    }),
  });
  const data = (await res.json().catch(() => null)) as any;
  if (data?.success && data?.data?.id) return { ok: true, projectId: data.data.id };

  // Preserve paywall details (402) so callers can show premium upgrade CTAs.
  if (res.status === 402) {
    return {
      ok: false,
      status: 402,
      code: typeof data?.code === 'string' ? data.code : 'PAYWALL_PROCESSES',
      recommendedPlan: data?.recommendedPlan === 'team' ? 'team' : 'pro',
      error: typeof data?.error === 'string' && data.error ? data.error : 'Process limit reached. Upgrade to continue.',
    };
  }

  return {
    ok: false,
    status: res.status,
    error:
      typeof data?.error === 'string' && data.error
        ? data.error
        : 'Could not create the Inbox process. Please try again.',
  };
}
