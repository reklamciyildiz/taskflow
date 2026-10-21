export type MobileUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  organizationId: string | null;
  role: string | null;
};

export type MobileSessionTokens = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: MobileUser;
};

export type MobileProcessSummary = {
  id: string;
  name: string;
  teamId: string | null;
  visibility: 'team' | 'restricted' | 'private';
  activeActionCount: number;
};

export type MobileActionSummary = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  priority: string | null;
  status: string | null;
};

export type MobileWorkspace = {
  processes: MobileProcessSummary[];
  recentActions: MobileActionSummary[];
};

export type MobilePlannerItem = {
  id: string;
  scheduleId: string;
  taskId: string;
  taskTitle: string;
  sourceType: 'action' | 'checklist_item';
  checklistItemId: string | null;
  checklistItemText: string | null;
  processId: string | null;
  processName: string | null;
  effectiveDate: string;
  occurrenceDate: string;
  scheduleTime: string | null;
  durationMinutes: number | null;
  state: 'pending' | 'completed' | 'skipped';
  recurring: boolean;
  missedCount: number;
};

export type MobilePlannerToday = {
  date: string;
  overdue: MobilePlannerItem[];
  today: MobilePlannerItem[];
  completedToday: MobilePlannerItem[];
};

export type MobileKnowledgeEntry = {
  id: string;
  actionId: string;
  actionTitle: string;
  processId: string | null;
  processName: string | null;
  title: string;
  type: 'note' | 'learning' | 'idea' | 'decision';
  excerpt: string;
  updatedAt: string;
  authorName: string;
};

export type MobileProcessDetail = {
  process: MobileProcessSummary;
  totalActions: number;
  hasMore: boolean;
  actions: Array<MobileActionSummary & {
    description: string;
    stageLabel: string;
    completed: boolean;
    checklist: { total: number; completed: number };
    updatedAt: string;
  }>;
};

export type MobileActionDetail = {
  id: string;
  title: string;
  description: string;
  priority: string | null;
  stageId: string;
  stageLabel: string;
  completed: boolean;
  assigneeId: string | null;
  process: { id: string; name: string } | null;
  checklist: Array<{
    id: string;
    text: string;
    checked: boolean;
    assigneeId?: string | null;
    dueDate?: string | null;
    completedAt?: string | null;
  }>;
  updatedAt: string;
};
