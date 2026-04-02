'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { taskApi, teamApi, memberApi, projectApi } from '@/lib/api';
import { getPermissions, canEditTask, canDeleteTask, canCompleteTask, Permission, Role } from '@/lib/permissions';
import {
  type Task,
  type TaskStatus,
  type TaskPriority,
  type Customer,
  type Comment,
  type TeamMember,
  type Team,
  type Project,
  type ProjectColumnConfig,
  type UpdateTaskRequest,
  FALLBACK_BOARD_COLUMNS,
  parseColumnConfigFromJson,
} from '@/lib/types';

export type { Task, TaskStatus, TaskPriority, Customer, Comment, TeamMember, Team, Project, ProjectColumnConfig };

/** Team roles in a team (not org owner) */
export type UserRole = 'admin' | 'member' | 'viewer';

interface MemberFormData extends Omit<TeamMember, 'id' | 'isOnline' | 'joinedAt'> {}

export type FilterType = 'dueToday' | 'highPriority' | 'assignedToMe' | null;

export type BoardScope =
  | { type: 'general' }
  | { type: 'project'; projectId: string };

interface TaskContextType {
  tasks: Task[];
  teams: Team[];
  projects: Project[];
  customers: Customer[];
  currentTeam: Team | null;
  currentProject: Project | null;
  /** Board scope: either General (no process) or a specific project. */
  boardScope: BoardScope;
  /** Convenience: resolved project for boardScope when type=project, else null. */
  boardProject: Project | null;
  /** Resolved columns for TaskBoard (project config or FALLBACK_BOARD_COLUMNS) */
  boardColumns: ProjectColumnConfig[];
  /** Customizable columns for General board (no process), stored per team. */
  generalBoardColumns: ProjectColumnConfig[];
  currentUser: TeamMember | null;
  currentUserRole: Role;
  permissions: Permission;
  organizationName: string;
  organizationId: string | null;
  loading: boolean;
  error: string | null;
  filter: FilterType;
  customerFilter: string | null;
  setFilter: (filter: FilterType) => void;
  setCustomerFilter: (customerId: string | null) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  setBoardScope: (scope: BoardScope) => void;
  setGeneralBoardColumns: (cols: ProjectColumnConfig[]) => void;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'attachments' | 'comments'>) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean>;
  deleteTask: (id: string) => Promise<void>;
  setCurrentTeam: (teamId: string) => void;
  addTeam: (team: Omit<Team, 'id' | 'createdAt'>) => Promise<void>;
  createTeam: (name: string, description?: string) => Promise<void>;
  updateTeam: (teamId: string, name: string, description: string) => Promise<void>;
  updateMemberRole: (teamId: string, memberId: string, role: Role) => Promise<void>;
  addMember: (teamId: string, member: MemberFormData) => Promise<void>;
  updateMember: (teamId: string, memberId: string, updates: Partial<MemberFormData>) => Promise<void>;
  removeMember: (teamId: string, memberId: string) => Promise<void>;
  getTeamMembers: (teamId: string) => TeamMember[];
  inviteMember: (teamId: string, member: Omit<TeamMember, 'id' | 'isOnline'>) => Promise<void>;
  moveMember: (memberId: string, fromTeamId: string, toTeamId: string) => Promise<void>;
  addMemberToTeam: (userId: string, teamId: string) => Promise<void>;
  updateOrganization: (name: string) => Promise<void>;
  refreshData: () => Promise<void>;
  fetchCustomers: () => Promise<void>;
  addCustomer: (customer: { name: string; email?: string; phone?: string; address?: string; notes?: string }) => Promise<void>;
  updateCustomer: (id: string, updates: { name?: string; email?: string; phone?: string; address?: string; notes?: string }) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  canEditTask: (taskCreatorId?: string | null, taskAssigneeId?: string | null) => boolean;
  canDeleteTask: (taskCreatorId?: string | null) => boolean;
  canCompleteTask: (taskAssigneeId?: string | null) => boolean;
  /** Global action editor (Board, List, Knowledge Hub) */
  editingTaskId: string | null;
  openTaskEditor: (taskId: string) => void;
  /** Alias for `openTaskEditor` — opens the Aksiyon panel. */
  openActionEditor: (taskId: string) => void;
  closeTaskEditor: () => void;
  /** Prevent accidental editor opens (e.g. click-through after menu close). */
  suppressTaskEditorOpenFor: (ms: number) => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

function mapJournalLogs(raw: unknown): Task['journalLogs'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: Record<string, unknown>, i: number) => {
    const updatedRaw = item.updated_at ?? item.updatedAt;
    return {
      id: String(item.id ?? `jl-${i}`),
      text: String(item.text ?? ''),
      createdAt: String(item.created_at ?? item.createdAt ?? new Date().toISOString()),
      ...(item.done === true ? { done: true } : {}),
      ...(typeof updatedRaw === 'string' && updatedRaw
        ? { updatedAt: updatedRaw }
        : {}),
    };
  });
}

// Helper to transform API data to frontend format
function transformTask(apiTask: any): Task {
  return {
    id: apiTask.id,
    title: apiTask.title,
    description: apiTask.description || '',
    status: String(apiTask.status ?? 'todo'),
    priority: apiTask.priority as TaskPriority,
    dueDate: apiTask.due_date ? new Date(apiTask.due_date) : undefined,
    assigneeId: apiTask.assignee_id,
    customerId: apiTask.customer_id,
    customerName: apiTask.customer?.name,
    teamId: apiTask.team_id,
    projectId: apiTask.project_id ?? null,
    journalLogs: mapJournalLogs(apiTask.journal_logs),
    learnings: apiTask.learnings ?? null,
    createdBy: apiTask.created_by || apiTask.createdBy || apiTask.user_id,
    createdAt: new Date(apiTask.created_at),
    updatedAt: new Date(apiTask.updated_at),
    attachments: [],
    comments: (apiTask.comments || []).map((c: any) => ({
      id: c.id,
      text: c.text,
      authorId: c.author_id,
      createdAt: new Date(c.created_at),
    })),
  };
}

function transformTeam(apiTeam: any): Team {
  return {
    id: apiTeam.id,
    name: apiTeam.name,
    description: apiTeam.description || '',
    createdBy: apiTeam.created_by || '',
    createdAt: new Date(apiTeam.created_at),
    updatedAt: new Date(apiTeam.updated_at || apiTeam.created_at),
    members: (apiTeam.team_members || []).map((tm: any) => ({
      id: tm.user?.id || tm.user_id,
      name: tm.user?.name || 'Unknown',
      email: tm.user?.email || '',
      role: tm.role as UserRole,
      avatar: tm.user?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(tm.user?.name || 'U')}`,
      isOnline: tm.user?.is_online || false,
      joinedAt: new Date(tm.joined_at || apiTeam.created_at),
    })),
  };
}

function transformProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    organizationId: row.organization_id,
    teamId: row.team_id ?? null,
    columnConfig: parseColumnConfigFromJson(row.column_config),
    createdAt: new Date(row.created_at),
  };
}

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currentTeam, setCurrentTeamState] = useState<Team | null>(null);
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [boardScope, setBoardScopeState] = useState<BoardScope>({ type: 'general' });
  const [generalBoardColumns, setGeneralBoardColumnsState] = useState<ProjectColumnConfig[]>(
    () => FALLBACK_BOARD_COLUMNS.map((c) => ({ ...c }))
  );
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [organizationName, setOrganizationName] = useState<string>('My Organization');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** After first successful load, background refreshes (e.g. session refetch on tab focus) avoid clearing the UI. */
  const hasLoadedWorkspaceRef = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [filter, setFilter] = useState<FilterType>(null);
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const suppressTaskEditorOpenUntilRef = useRef<number>(0);

  const suppressTaskEditorOpenFor = useCallback((ms: number) => {
    const dur = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    suppressTaskEditorOpenUntilRef.current = Math.max(
      suppressTaskEditorOpenUntilRef.current,
      Date.now() + dur
    );
  }, []);

  const openTaskEditor = useCallback((taskId: string) => {
    if (Date.now() < suppressTaskEditorOpenUntilRef.current) return;
    setEditingTaskId(taskId);
  }, []);

  const closeTaskEditor = useCallback(() => {
    setEditingTaskId(null);
  }, []);

  const boardProject = useMemo(() => {
    if (boardScope.type !== 'project') return null;
    return projects.find((p) => p.id === boardScope.projectId) ?? null;
  }, [boardScope, projects]);

  const boardColumns = useMemo((): ProjectColumnConfig[] => {
    if (boardScope.type === 'general') {
      return generalBoardColumns.length ? generalBoardColumns : FALLBACK_BOARD_COLUMNS;
    }
    const cfg = boardProject?.columnConfig;
    if (cfg && cfg.length > 0) return cfg;
    return FALLBACK_BOARD_COLUMNS;
  }, [boardScope.type, boardProject, generalBoardColumns]);

  const replaceProjectQuery = useCallback(
    (projectId: string | null) => {
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      if (projectId) params.set('project', projectId);
      else params.delete('project');
      const q = params.toString();
      const target = q ? `${pathname}?${q}` : pathname;
      router.replace(target, { scroll: false });
    },
    [pathname, router]
  );

  const setCurrentProjectId = useCallback(
    (projectId: string | null) => {
      if (!projectId) {
        setCurrentProjectState(null);
        replaceProjectQuery(null);
        return;
      }
      const p = projects.find((x) => x.id === projectId);
      if (p) {
        setCurrentProjectState(p);
        replaceProjectQuery(projectId);
        try {
          if (typeof window !== 'undefined') {
            const raw = window.localStorage.getItem('taskflow:recentProjectIds');
            const arr = raw ? (JSON.parse(raw) as unknown) : [];
            const prev = Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
            const next = [projectId, ...prev.filter((x) => x !== projectId)].slice(0, 10);
            window.localStorage.setItem('taskflow:recentProjectIds', JSON.stringify(next));
          }
        } catch {
          // ignore
        }
      }
    },
    [projects, replaceProjectQuery]
  );

  const setBoardScope = useCallback(
    (scope: BoardScope) => {
      setBoardScopeState(scope);
      try {
        if (typeof window !== 'undefined') {
          const teamId = currentTeam?.id ?? 'none';
          window.localStorage.setItem(`taskflow:boardScope:${teamId}`, JSON.stringify(scope));
        }
      } catch {
        // ignore
      }
    },
    [currentTeam?.id]
  );

  const setGeneralBoardColumns = useCallback(
    (cols: ProjectColumnConfig[]) => {
      const next = Array.isArray(cols) ? cols.map((c) => ({ ...c })) : [];
      setGeneralBoardColumnsState(next);
      try {
        if (typeof window !== 'undefined') {
          const teamId = currentTeam?.id ?? 'none';
          window.localStorage.setItem(`taskflow:generalBoardColumns:${teamId}`, JSON.stringify(next));
        }
      } catch {
        // ignore
      }
    },
    [currentTeam?.id]
  );

  // Fetch data from API (reads latest session from sessionRef so the callback stays stable across session object churn)
  const refreshData = useCallback(async () => {
    const session = sessionRef.current;
    if (!session?.user) {
      hasLoadedWorkspaceRef.current = false;
      setLoading(false);
      return;
    }

    const showBlockingLoader = !hasLoadedWorkspaceRef.current;
    if (showBlockingLoader) {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch teams
      const teamsResponse = await teamApi.getAll();
      if (teamsResponse.success && teamsResponse.data) {
        const transformedTeams = teamsResponse.data.map(transformTeam);
        setTeams(transformedTeams);
        setCurrentTeamState((prev) => prev ?? transformedTeams[0] ?? null);
      }

      // Fetch tasks
      const tasksResponse = await taskApi.getAll();
      if (tasksResponse.success && tasksResponse.data) {
        const transformedTasks = tasksResponse.data.map(transformTask);
        setTasks(transformedTasks);
      }

      // Fetch current user from API to get latest data
      if (session.user?.email) {
        try {
          const userResponse = await fetch('/api/users/profile');
          const userData = await userResponse.json();
          if (userData.success && userData.data) {
            setCurrentUser({
              id: userData.data.id,
              name: userData.data.name || 'User',
              email: userData.data.email || '',
              role: userData.data.role || 'member',
              avatar: userData.data.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.data.name || 'U')}`,
              isOnline: true,
              joinedAt: new Date(),
            });
            
            // Fetch organization name
            if (userData.data.organization_id) {
              const oid = userData.data.organization_id;
              setOrganizationId(oid);
              try {
                const orgResponse = await fetch(`/api/organizations/${oid}`);
                const orgData = await orgResponse.json();
                if (orgData.success && orgData.data) {
                  setOrganizationName(orgData.data.name);
                }
              } catch (err) {
                console.error('Failed to fetch organization:', err);
              }

              try {
                const projRes = await projectApi.getAll(oid);
                if (projRes.success && projRes.data) {
                  setProjects(projRes.data.map(transformProject));
                } else {
                  setProjects([]);
                }
              } catch (err) {
                console.error('Failed to fetch projects:', err);
                setProjects([]);
              }
            }
          } else {
            // Fallback to session data
            setCurrentUser({
              id: (session.user as any).id || 'unknown',
              name: session.user.name || 'User',
              email: session.user.email || '',
              role: (session.user as any).role || 'member',
              avatar: session.user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.user.name || 'U')}`,
              isOnline: true,
              joinedAt: new Date(),
            });
          }
        } catch {
          // Fallback to session data on error
          setCurrentUser({
            id: (session.user as any).id || 'unknown',
            name: session.user.name || 'User',
            email: session.user.email || '',
            role: (session.user as any).role || 'member',
            avatar: session.user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.user.name || 'U')}`,
            isOnline: true,
            joinedAt: new Date(),
          });
        }
      }

      hasLoadedWorkspaceRef.current = true;
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      if (showBlockingLoader) {
        setLoading(false);
      }
    }
  }, []);

  // Restore last board scope per team (defaults to General).
  useEffect(() => {
    const teamId = currentTeam?.id;
    if (!teamId) return;
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(`taskflow:boardScope:${teamId}`);
      if (!raw) {
        setBoardScopeState({ type: 'general' });
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'type' in (parsed as any) &&
        ((parsed as any).type === 'general' ||
          ((parsed as any).type === 'project' && typeof (parsed as any).projectId === 'string'))
      ) {
        setBoardScopeState(parsed as BoardScope);
      } else {
        setBoardScopeState({ type: 'general' });
      }
    } catch {
      setBoardScopeState({ type: 'general' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- should rerun only when team changes
  }, [currentTeam?.id]);

  // Restore general board columns per team (defaults to FALLBACK_BOARD_COLUMNS).
  useEffect(() => {
    const teamId = currentTeam?.id;
    if (!teamId) return;
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(`taskflow:generalBoardColumns:${teamId}`);
      if (!raw) {
        setGeneralBoardColumnsState(FALLBACK_BOARD_COLUMNS.map((c) => ({ ...c })));
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const cleaned = parsed
          .filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
          .map((x, idx) => ({
            id: typeof x.id === 'string' ? x.id : `col-${idx + 1}`,
            title: typeof x.title === 'string' ? x.title : `Stage ${idx + 1}`,
            color: typeof x.color === 'string' ? x.color : undefined,
            isTerminal: x.isTerminal === true,
          }))
          .filter((c) => c.id && c.title);
        setGeneralBoardColumnsState(cleaned.length ? cleaned : FALLBACK_BOARD_COLUMNS.map((c) => ({ ...c })));
      } else {
        setGeneralBoardColumnsState(FALLBACK_BOARD_COLUMNS.map((c) => ({ ...c })));
      }
    } catch {
      setGeneralBoardColumnsState(FALLBACK_BOARD_COLUMNS.map((c) => ({ ...c })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rerun only when team changes
  }, [currentTeam?.id]);

  // If stored boardScope references a missing project, fall back to General.
  useEffect(() => {
    if (boardScope.type !== 'project') return;
    if (!projects.some((p) => p.id === boardScope.projectId)) {
      setBoardScopeState({ type: 'general' });
    }
  }, [boardScope, projects]);

  // Sync current project from ?project= when projects load or URL changes
  useEffect(() => {
    if (projects.length === 0) {
      setCurrentProjectState(null);
      return;
    }
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const pid = params.get('project');
    if (pid) {
      const match = projects.find((x) => x.id === pid);
      if (match) {
        setCurrentProjectState(match);
        return;
      }
    }
    setCurrentProjectState((prev) =>
      prev && projects.some((x) => x.id === prev.id) ? prev : null
    );
  }, [projects]);

  // Fetch customers from API
  const fetchCustomers = useCallback(async () => {
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      if (data.success && data.data) {
        const transformedCustomers = data.data.map((c: any) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          address: c.address,
          notes: c.notes,
          organizationId: c.organization_id,
          createdAt: new Date(c.created_at),
          updatedAt: new Date(c.updated_at),
          taskStats: c.taskStats,
        }));
        setCustomers(transformedCustomers);
      }
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  }, []);

  // Load workspace when the signed-in user changes (not when the session object is recreated on tab focus).
  useEffect(() => {
    void refreshData();
    void fetchCustomers();
  }, [session?.user?.email, refreshData, fetchCustomers]);

  // Soft refresh when the tab becomes visible again (silent after first load — no global loading flash).
  useEffect(() => {
    if (!session?.user?.email) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshData();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [session?.user?.email, refreshData]);

  // Add customer
  const addCustomer = useCallback(async (customerData: { name: string; email?: string; phone?: string; address?: string; notes?: string }) => {
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerData),
      });
      const data = await response.json();
      if (data.success) {
        await fetchCustomers();
      } else {
        throw new Error(data.error || 'Failed to create customer');
      }
    } catch (err) {
      console.error('Error creating customer:', err);
      throw err;
    }
  }, [fetchCustomers]);

  // Update customer
  const updateCustomer = useCallback(async (id: string, updates: { name?: string; email?: string; phone?: string; address?: string; notes?: string }) => {
    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await response.json();
      if (data.success) {
        await fetchCustomers();
      } else {
        throw new Error(data.error || 'Failed to update customer');
      }
    } catch (err) {
      console.error('Error updating customer:', err);
      throw err;
    }
  }, [fetchCustomers]);

  // Delete customer
  const deleteCustomer = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        await fetchCustomers();
      } else {
        throw new Error(data.error || 'Failed to delete customer');
      }
    } catch (err) {
      console.error('Error deleting customer:', err);
      throw err;
    }
  }, [fetchCustomers]);

  // Add task via API
  const addTask = useCallback(async (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'attachments' | 'comments'>) => {
    try {
      const response = await taskApi.create({
        title: taskData.title,
        description: taskData.description,
        status: taskData.status ?? 'todo',
        priority: taskData.priority,
        dueDate: taskData.dueDate?.toISOString(),
        assigneeId: taskData.assigneeId,
        customerId: taskData.customerId,
        teamId: taskData.teamId,
        projectId: taskData.projectId ?? currentProject?.id ?? null,
      });

      if (response.success && response.data) {
        const newTask = transformTask(response.data);
        setTasks(prev => [...prev, newTask]);
        // Refresh customers to update task stats
        await fetchCustomers();
      } else {
        console.error('Failed to create task:', response.error);
      }
    } catch (err) {
      console.error('Error creating task:', err);
    }
  }, [fetchCustomers, currentProject?.id]);

  // Update task via API with optimistic update — returns false if rolled back
  const updateTask = useCallback(async (id: string, updates: Partial<Task>): Promise<boolean> => {
    const previousTasks = tasks;

    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, ...updates, updatedAt: new Date() } : task
      )
    );

    try {
      const apiUpdates: Record<string, unknown> = {};
      if (updates.title !== undefined) apiUpdates.title = updates.title;
      if (updates.description !== undefined) apiUpdates.description = updates.description;
      if (updates.status !== undefined) apiUpdates.status = updates.status;
      if (updates.priority !== undefined) apiUpdates.priority = updates.priority;
      if (updates.dueDate !== undefined) apiUpdates.dueDate = updates.dueDate?.toISOString();
      if (updates.assigneeId !== undefined) apiUpdates.assigneeId = updates.assigneeId;
      if (updates.customerId !== undefined) apiUpdates.customerId = updates.customerId;
      if (updates.projectId !== undefined) apiUpdates.projectId = updates.projectId;
      if (updates.learnings !== undefined) apiUpdates.learnings = updates.learnings;
      if (updates.journalLogs !== undefined) apiUpdates.journalLogs = updates.journalLogs;

      const response = await taskApi.update(id, apiUpdates as UpdateTaskRequest);

      if (!response.success) {
        console.error('Failed to update task:', response.error);
        setTasks(previousTasks);
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error updating task:', err);
      setTasks(previousTasks);
      return false;
    }
  }, [tasks]);

  // Delete task via API
  const deleteTask = useCallback(async (id: string) => {
    try {
      // Close editor immediately to avoid a stale "view action" state
      // if the card opens via a click race while deletion is in flight.
      setEditingTaskId((cur) => (cur === id ? null : cur));
      const response = await taskApi.delete(id);
      if (response.success) {
        setTasks(prev => prev.filter(task => task.id !== id));
      }
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  }, []);

  // Set current team
  const setCurrentTeam = useCallback((teamId: string) => {
    const team = teams.find(t => t.id === teamId);
    if (team) {
      setCurrentTeamState(team);
    }
  }, [teams]);

  // Add team via API
  const addTeam = useCallback(async (teamData: Omit<Team, 'id' | 'createdAt'>) => {
    try {
      const response = await teamApi.create({
        name: teamData.name,
        description: teamData.description,
      });

      if (response.success && response.data) {
        const newTeam = transformTeam(response.data);
        setTeams(prev => [...prev, newTeam]);
      }
    } catch (err) {
      console.error('Error creating team:', err);
    }
  }, []);

  // Add member via API
  const addMember = useCallback(async (teamId: string, memberData: MemberFormData) => {
    try {
      const response = await memberApi.add(teamId, {
        name: memberData.name,
        email: memberData.email,
        role: memberData.role as 'admin' | 'member' | 'viewer',
        avatar: memberData.avatar,
      });

      if (response.success) {
        await refreshData(); // Refresh to get updated team members
      }
    } catch (err) {
      console.error('Error adding member:', err);
    }
  }, [refreshData]);

  // Update member (local only for now)
  const updateMember = useCallback(async (teamId: string, memberId: string, updates: Partial<MemberFormData>) => {
    setTeams(prevTeams => {
      const teamIndex = prevTeams.findIndex(t => t.id === teamId);
      if (teamIndex === -1) return prevTeams;

      const team = prevTeams[teamIndex];
      const memberIndex = team.members.findIndex(m => m.id === memberId);
      if (memberIndex === -1) return prevTeams;

      const updatedTeams = [...prevTeams];
      const updatedMembers = [...team.members];
      updatedMembers[memberIndex] = { ...updatedMembers[memberIndex], ...updates };
      updatedTeams[teamIndex] = { ...team, members: updatedMembers };
      return updatedTeams;
    });
  }, []);

  // Remove member via API
  const removeMember = useCallback(async (teamId: string, memberId: string) => {
    try {
      const response = await memberApi.remove(teamId, memberId);
      if (response.success) {
        setTeams(prevTeams => {
          const teamIndex = prevTeams.findIndex(t => t.id === teamId);
          if (teamIndex === -1) return prevTeams;

          const updatedTeams = [...prevTeams];
          updatedTeams[teamIndex] = {
            ...updatedTeams[teamIndex],
            members: updatedTeams[teamIndex].members.filter(m => m.id !== memberId)
          };
          return updatedTeams;
        });
      }
    } catch (err) {
      console.error('Error removing member:', err);
    }
  }, []);

  // Get team members
  const getTeamMembers = useCallback((teamId: string): TeamMember[] => {
    return teams.find(t => t.id === teamId)?.members || [];
  }, [teams]);

  // Invite member (alias for addMember)
  const inviteMember = useCallback(async (teamId: string, member: Omit<TeamMember, 'id' | 'isOnline'>) => {
    await addMember(teamId, member as MemberFormData);
  }, [addMember]);

  // Move member to another team
  const moveMember = useCallback(async (memberId: string, fromTeamId: string, toTeamId: string) => {
    try {
      const response = await fetch(`/api/teams/${fromTeamId}/members/${memberId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTeamId: toTeamId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to move member');
      }

      // Refresh teams data to reflect the move
      await refreshData();
    } catch (err) {
      console.error('Error moving member:', err);
      throw err;
    }
  }, [refreshData]);

  // Add existing member to team
  const addMemberToTeam = useCallback(async (userId: string, teamId: string) => {
    try {
      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add member to team');
      }

      // Refresh teams data to reflect the addition
      await refreshData();
    } catch (err) {
      console.error('Error adding member to team:', err);
      throw err;
    }
  }, [refreshData]);

  // Create team via API
  const createTeam = useCallback(async (name: string, description?: string) => {
    try {
      const response = await teamApi.create({ name, description: description || '' });
      if (response.success && response.data) {
        const newTeam = transformTeam(response.data);
        setTeams(prev => [...prev, newTeam]);
        setCurrentTeamState(newTeam);
      } else {
        throw new Error(response.error || 'Failed to create team');
      }
    } catch (err: any) {
      console.error('Error creating team:', err);
      throw err;
    }
  }, []);

  // Update team via API
  const updateTeam = useCallback(async (teamId: string, name: string, description: string) => {
    try {
      const response = await teamApi.update(teamId, { name, description });
      if (response.success) {
        setTeams(prev => prev.map(team => 
          team.id === teamId ? { ...team, name, description } : team
        ));
        // Update currentTeam if it's the one being edited
        if (currentTeam?.id === teamId) {
          setCurrentTeamState(prev => prev ? { ...prev, name, description } : null);
        }
      } else {
        throw new Error(response.error || 'Failed to update team');
      }
    } catch (err: any) {
      console.error('Error updating team:', err);
      throw err;
    }
  }, [currentTeam?.id]);

  // Update member role
  const updateMemberRole = useCallback(async (teamId: string, memberId: string, role: Role) => {
    try {
      const response = await memberApi.updateRole(teamId, memberId, role);
      if (response.success) {
        setTeams(prev => prev.map(team => {
          if (team.id === teamId) {
            return {
              ...team,
              members: team.members.map(m => 
                m.id === memberId ? { ...m, role } : m
              )
            };
          }
          return team;
        }));
        // Update currentTeam if needed
        if (currentTeam?.id === teamId) {
          setCurrentTeamState(prev => prev ? {
            ...prev,
            members: prev.members.map(m => 
              m.id === memberId ? { ...m, role } : m
            )
          } : null);
        }
      } else {
        throw new Error(response.error || 'Failed to update member role');
      }
    } catch (err: any) {
      console.error('Error updating member role:', err);
      throw err;
    }
  }, [currentTeam?.id]);

  // Calculate current user's role in the current team
  const currentUserRole: Role = useMemo(() => {
    if (!currentTeam || !currentUser) return 'viewer';
    const member = currentTeam.members.find(m => m.id === currentUser.id);
    return (member?.role as Role) || 'member';
  }, [currentTeam, currentUser]);

  // Get permissions based on role
  const permissions = useMemo(() => {
    return getPermissions(currentUserRole);
  }, [currentUserRole]);

  // Permission check functions
  const checkCanEditTask = useCallback((taskCreatorId?: string | null, taskAssigneeId?: string | null): boolean => {
    if (!currentUser) return false;
    return canEditTask(currentUserRole, currentUser.id, taskCreatorId, taskAssigneeId);
  }, [currentUserRole, currentUser]);

  const checkCanDeleteTask = useCallback((taskCreatorId?: string | null): boolean => {
    if (!currentUser) return false;
    return canDeleteTask(currentUserRole, currentUser.id, taskCreatorId);
  }, [currentUserRole, currentUser]);

  const checkCanCompleteTask = useCallback((taskAssigneeId?: string | null): boolean => {
    if (!currentUser) return false;
    return canCompleteTask(currentUserRole, currentUser.id, taskAssigneeId);
  }, [currentUserRole, currentUser]);

  // Update organization name
  const updateOrganization = useCallback(async (name: string) => {
    if (!organizationId) {
      throw new Error('No organization ID found');
    }
    
    try {
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      
      const data = await response.json();
      if (data.success) {
        setOrganizationName(name);
      } else {
        throw new Error(data.error || 'Failed to update organization');
      }
    } catch (err: any) {
      console.error('Error updating organization:', err);
      throw err;
    }
  }, [organizationId]);

  return (
    <TaskContext.Provider value={{
      tasks,
      teams,
      projects,
      customers,
      currentTeam,
      currentProject,
      boardScope,
      boardProject,
      boardColumns,
      generalBoardColumns,
      currentUser,
      currentUserRole,
      permissions,
      organizationName,
      organizationId,
      loading,
      error,
      filter,
      customerFilter,
      setFilter,
      setCustomerFilter,
      setCurrentProjectId,
      setBoardScope,
      setGeneralBoardColumns,
      addTask,
      updateTask,
      deleteTask,
      setCurrentTeam,
      addTeam,
      createTeam,
      updateTeam,
      updateMemberRole,
      addMember,
      updateMember,
      removeMember,
      getTeamMembers,
      inviteMember,
      moveMember,
      addMemberToTeam,
      updateOrganization,
      refreshData,
      fetchCustomers,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      canEditTask: checkCanEditTask,
      canDeleteTask: checkCanDeleteTask,
      canCompleteTask: checkCanCompleteTask,
      editingTaskId,
      openTaskEditor,
      openActionEditor: openTaskEditor,
      closeTaskEditor,
      suppressTaskEditorOpenFor,
    }}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTaskContext() {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
}