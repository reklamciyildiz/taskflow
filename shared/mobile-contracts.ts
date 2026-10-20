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
