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

// Generic fetch wrapper with error handling
async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'An error occurred',
      };
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    return {
      success: false,
      error: 'Network error. Please try again.',
    };
  }
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

// Projects (pipelines / süreçler)
export const projectApi = {
  getAll: (organizationId?: string) =>
    fetchApi<Project[]>(
      organizationId ? `/projects?organizationId=${encodeURIComponent(organizationId)}` : '/projects'
    ),
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
