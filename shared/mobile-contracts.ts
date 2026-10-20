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
