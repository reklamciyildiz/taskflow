// API Client for frontend-backend communication

import {
  Task,
  Team,
  TeamMember,
  Project,
  ApiResponse,
  CreateTaskRequest,
  UpdateTaskRequest,
  CreateTeamRequest,
  UpdateTeamRequest,
  AddMemberRequest,
  UpdateMemberRequest,
} from './types';

const API_BASE = '/api';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * fetch() wrapper that transparently retries transient failures (network errors and
 * 5xx responses) with a short backoff. Only idempotent requests (GET) are retried so
 * mutations are never accidentally applied twice.
 *
 * This absorbs the brief server "cold start" / DB-burst 500s that occur on first paint
 * and tab-refocus, so the UI self-heals within a couple hundred ms instead of flashing
 * an empty/"No processes yet" state.
 */
export async function fetchJsonWithRetry(
  input: string,
  init?: RequestInit,
  retries = 2
): Promise<{ ok: boolean; status: number; json: any } | null> {
  const method = (init?.method || 'GET').toUpperCase();
  const canRetry = method === 'GET';

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.status >= 500 && canRetry && attempt < retries) {
        await delay(250 * (attempt + 1));
        continue;
      }
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { ok: res.ok, status: res.status, json };
    } catch (error) {
      if (canRetry && attempt < retries) {
        await delay(250 * (attempt + 1));
        continue;
      }
      console.error('API Error:', error);
      return null;
    }
  }
}

// Generic fetch wrapper with error handling
async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const result = await fetchJsonWithRetry(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!result) {
    return {
      success: false,
      error: 'Network error. Please try again.',
    };
  }

  const { ok, status, json: data } = result;

  if (!ok) {
    return {
      success: false,
      error: data?.error || 'An error occurred',
      code: typeof data?.code === 'string' ? data.code : undefined,
      recommendedPlan:
        data?.recommendedPlan === 'pro' || data?.recommendedPlan === 'team' ? data.recommendedPlan : undefined,
      status,
    };
  }

  return data;
}

// Task API
export const taskApi = {
  getAll: (teamId?: string) => 
    fetchApi<Task[]>(teamId ? `/tasks?teamId=${teamId}` : '/tasks'),

  getById: (id: string) => 
    fetchApi<Task>(`/tasks/${id}`),

  create: (task: CreateTaskRequest) =>
    fetchApi<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    }),

  update: (id: string, updates: UpdateTaskRequest) =>
    fetchApi<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    fetchApi<null>(`/tasks/${id}`, {
      method: 'DELETE',
    }),

  addComment: (taskId: string, text: string) =>
    fetchApi<Task>(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};

// Team API
export const teamApi = {
  getAll: (userId?: string) =>
    fetchApi<Team[]>(userId ? `/teams?userId=${userId}` : '/teams'),

  getById: (id: string) =>
    fetchApi<Team>(`/teams/${id}`),

  create: (team: CreateTeamRequest) =>
    fetchApi<Team>('/teams', {
      method: 'POST',
      body: JSON.stringify(team),
    }),

  update: (id: string, updates: UpdateTeamRequest) =>
    fetchApi<Team>(`/teams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (id: string) =>
    fetchApi<null>(`/teams/${id}`, {
      method: 'DELETE',
    }),
};

// Projects (pipelines / processes)
export const projectApi = {
  getAll: (input?: { organizationId?: string; teamId?: string | null }) => {
    const org = input?.organizationId;
    const teamId = input?.teamId;
    const qs = new URLSearchParams();
    if (org) qs.set('organizationId', org);
    if (teamId) qs.set('teamId', teamId);
    const q = qs.toString();
    return fetchApi<Project[]>(q ? `/projects?${q}` : '/projects');
  },

  create: (body: { name: string; teamId?: string | null; organizationId?: string; columnConfig?: unknown }) =>
    fetchApi<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// Member API
export const memberApi = {
  getAll: (teamId: string) =>
    fetchApi<TeamMember[]>(`/teams/${teamId}/members`),

  add: (teamId: string, member: AddMemberRequest) =>
    fetchApi<TeamMember>(`/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify(member),
    }),

  update: (teamId: string, memberId: string, updates: UpdateMemberRequest) =>
    fetchApi<TeamMember>(`/teams/${teamId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  updateRole: (teamId: string, memberId: string, role: 'admin' | 'member' | 'viewer') =>
    fetchApi<TeamMember>(`/teams/${teamId}/members/${memberId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  remove: (teamId: string, memberId: string) =>
    fetchApi<null>(`/teams/${teamId}/members/${memberId}`, {
      method: 'DELETE',
    }),
};
