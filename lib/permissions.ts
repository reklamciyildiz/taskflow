// Role-Based Access Control (RBAC) System
// Defines permissions for different roles in the application

export type Role = 'admin' | 'member' | 'viewer';

export interface Permission {
  // Task permissions
  canCreateTask: boolean;
  canEditAnyTask: boolean;
  canEditOwnTask: boolean;
  canDeleteAnyTask: boolean;
  canDeleteOwnTask: boolean;
  canAssignTask: boolean;
  canCompleteAnyTask: boolean;
  canCompleteAssignedTask: boolean;
  
  // Team permissions
  canEditTeam: boolean;
  canDeleteTeam: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canChangeRoles: boolean;
  
  // View permissions
  canViewAnalytics: boolean;
  canExportData: boolean;
}

// Permission definitions for each role
export const rolePermissions: Record<Role, Permission> = {
  admin: {
    canCreateTask: true,
    canEditAnyTask: true,
    canEditOwnTask: true,
    canDeleteAnyTask: true,
    canDeleteOwnTask: true,
    canAssignTask: true,
    canCompleteAnyTask: true,
    canCompleteAssignedTask: true,
    canEditTeam: true,
    canDeleteTeam: true,
    canInviteMembers: true,
    canRemoveMembers: true,
    canChangeRoles: true,
    canViewAnalytics: true,
    canExportData: true,
  },
  member: {
    canCreateTask: true,
    // Team members may collaborate on any action in processes they can access
    // (visibility gates who sees the process; team role gates write vs viewer read-only).
    canEditAnyTask: true,
    canEditOwnTask: true,
    canDeleteAnyTask: true,
    canDeleteOwnTask: true,
    canAssignTask: true,
    canCompleteAnyTask: true,
    canCompleteAssignedTask: true,
    canEditTeam: false,
    canDeleteTeam: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canViewAnalytics: true,
    canExportData: true,
  },
  viewer: {
    canCreateTask: false,
    canEditAnyTask: false,
    canEditOwnTask: false,
    canDeleteAnyTask: false,
    canDeleteOwnTask: false,
    canAssignTask: false,
    canCompleteAnyTask: false,
    canCompleteAssignedTask: false,
    canEditTeam: false,
    canDeleteTeam: false,
    canInviteMembers: false,
    canRemoveMembers: false,
    canChangeRoles: false,
    canViewAnalytics: true,
    canExportData: false,
  },
};

// Helper function to get permissions for a role
export function getPermissions(role: Role): Permission {
  return rolePermissions[role] || rolePermissions.viewer;
}

// Helper function to check if user can perform action on a task
export function canEditTask(
  userRole: Role,
  userId: string,
  taskCreatorId?: string | null,
  taskAssigneeId?: string | null
): boolean {
  const permissions = getPermissions(userRole);
  
  if (permissions.canEditAnyTask) return true;
  if (permissions.canEditOwnTask) {
    return userId === taskCreatorId || userId === taskAssigneeId;
  }
  return false;
}

export function canDeleteTask(
  userRole: Role,
  userId: string,
  taskCreatorId?: string | null
): boolean {
  const permissions = getPermissions(userRole);
  
  if (permissions.canDeleteAnyTask) return true;
  if (permissions.canDeleteOwnTask) {
    return userId === taskCreatorId;
  }
  return false;
}

export function canCompleteTask(
  userRole: Role,
  userId: string,
  taskAssigneeId?: string | null
): boolean {
  const permissions = getPermissions(userRole);
  
  if (permissions.canCompleteAnyTask) return true;
  if (permissions.canCompleteAssignedTask) {
    return userId === taskAssigneeId;
  }
  return false;
}

// Role display names
export const roleDisplayNames: Record<Role, string> = {
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

// Role descriptions
export const roleDescriptions: Record<Role, string> = {
  admin: 'Full access to all features including team management',
  member: 'Can create and collaborate on team actions; delete mainly own work',
  viewer: 'Read-only access to view actions and analytics',
};
