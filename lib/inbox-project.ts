import type { Project, Team } from '@/lib/types';

const INBOX_NAMES = new Set(['inbox', 'gelen kutusu', 'gel kutusu']);

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
}): Promise<string | null> {
  const { projects, currentTeam, organizationId } = options;
  if (!currentTeam || !organizationId) return null;
  const existing = findInboxProject(projects, currentTeam);
  if (existing) return existing.id;

  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Inbox',
      teamId: currentTeam.id,
      organizationId,
    }),
  });
  const data = (await res.json()) as { success?: boolean; data?: { id?: string } };
  if (data.success && data.data?.id) return data.data.id;
  return null;
}
