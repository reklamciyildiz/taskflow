// Extended types for the application

/** Pipeline column id (e.g. todo, applied, interview) — stored as tasks.status in DB */
export type TaskStatus = string;

/** Built-in default column ids when no project column_config is set */
export const DEFAULT_PIPELINE_STATUS_IDS = ['todo', 'progress', 'review', 'done'] as const;
export type DefaultPipelineStatusId = (typeof DEFAULT_PIPELINE_STATUS_IDS)[number];

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface JournalLogEntry {
  id: string;
  text: string;
  createdAt: string;
  /** Set when the note text was last edited; API stores as `updated_at`. */
  updatedAt?: string;
  /** Checklist completion — stored inside `journal_logs` JSON. */
  done?: boolean;
  /** Optional team member responsible for this checklist row (in-app notify on change). */
  assigneeId?: string | null;
  /** Optional due date for this row (`YYYY-MM-DD`, same convention as task due dates). */
  dueDate?: string | null;
}

export interface ProjectColumnConfig {
  id: string;
  title: string;
  color?: string;
  isTerminal?: boolean;
}

/** Board columns when project has no column_config (To Do → In Progress → Done) */
export const FALLBACK_BOARD_COLUMNS: ProjectColumnConfig[] = [
  { id: 'todo', title: 'To Do', color: 'bg-slate-100 dark:bg-slate-800' },
  { id: 'progress', title: 'In Progress', color: 'bg-blue-50 dark:bg-blue-500/10' },
  { id: 'done', title: 'Done', color: 'bg-emerald-50 dark:bg-emerald-500/10', isTerminal: true },
];

export function parseColumnConfigFromJson(raw: unknown): ProjectColumnConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => {
      const id = typeof item.id === 'string' ? item.id : '';
      const title = typeof item.title === 'string' ? item.title : id;
      const color = typeof item.color === 'string' ? item.color : undefined;
      const isTerminal = item.isTerminal === true;
      return { id, title, color, isTerminal };
    })
    .filter((c) => c.id.length > 0);
}

/** Map task.status to a visible column id when using a reduced default board (e.g. legacy `review`). */
export function resolveTaskBoardColumnId(
  status: string,
  columns: ProjectColumnConfig[]
): string {
  const ids = new Set(columns.map((c) => c.id));
  if (ids.has(status)) return status;
  if (status === 'review' && ids.has('progress')) return 'progress';
  // DB still has `done` but the process has no `done` column (custom terminal id) — don't fall back to todo.
  if (status === 'done' && !ids.has('done')) {
    const terminal = columns.find((c) => c.isTerminal);
    if (terminal) return terminal.id;
  }
  if (ids.has('todo')) return 'todo';
  return columns[0]?.id ?? 'todo';
}

export function isTerminalBoardColumn(
  columnId: string,
  columns: ProjectColumnConfig[]
): boolean {
  const col = columns.find((c) => c.id === columnId);
  if (col?.isTerminal) return true;
  return columnId === 'done';
}

export interface Project {
  id: string;
  name: string;
  organizationId: string;
  teamId: string | null;
  columnConfig: ProjectColumnConfig[];
  /** Visibility scope within a team. Missing means legacy 'team'. */
  visibility?: 'team' | 'restricted' | 'private';
  /** Creator for private visibility (may be null for legacy rows). */
  createdBy?: string | null;
  createdAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  assigneeId?: string | null;
  customerId?: string | null;
  customerName?: string;
  teamId: string;
  projectId?: string | null;
  journalLogs?: JournalLogEntry[];
  learnings?: string | null;
  /** Order within the same board column (status); lower = higher on the board. */
  boardPosition: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  attachments: string[];
  comments: Comment[];
}

/** Client-side task updates. `dueDate: null` clears the due date. */
export type TaskUpdateFields = Partial<Omit<Task, 'dueDate'>> & {
  dueDate?: Date | null;
};

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
  taskStats?: {
    total: number;
    completed: number;
  };
}

export interface Comment {
  id: string;
  text: string;
  authorId: string;
  createdAt: Date;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  isOnline: boolean;
  joinedAt: Date;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Request/Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateTaskRequest {
  title: string;
  description: string;
  status?: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  assigneeId?: string | null;
  customerId?: string | null;
  teamId: string;
  projectId?: string | null;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  /** `YYYY-MM-DD` for date-only, or legacy ISO datetime. `null` clears. */
  dueDate?: string | null;
  assigneeId?: string | null;
  customerId?: string | null;
  projectId?: string | null;
  journalLogs?: JournalLogEntry[];
  learnings?: string | null;
  boardPosition?: number;
}

export interface CreateTeamRequest {
  name: string;
  description: string;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
}

export interface AddMemberRequest {
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export interface UpdateMemberRequest {
  name?: string;
  email?: string;
  role?: UserRole;
  avatar?: string;
}
