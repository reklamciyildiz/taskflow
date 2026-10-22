'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { plannerApi as webPlannerApi, scheduleApi as webScheduleApi } from '@/lib/api';
import type {
  Project,
  ProjectColumnConfig,
  Task,
  TaskUpdateFields,
  Team,
  TeamMember,
} from '@/lib/types';

export type PlannerRuntime = {
  tasks: Task[];
  projects: Project[];
  teams: Team[];
  currentTeam: Team | null;
  currentUser: TeamMember | null;
  generalBoardColumns: ProjectColumnConfig[];
  loading: boolean;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'attachments' | 'comments' | 'boardPosition' | 'status'> & { status?: string }) => Promise<Task>;
  updateTask: (id: string, updates: TaskUpdateFields) => Promise<boolean>;
  canCompleteTask: (assigneeId?: string | null) => boolean;
  canEditTask: (creatorId?: string | null, assigneeId?: string | null) => boolean;
  openTaskEditor: (taskId: string, checklistItemId?: string | null) => void;
  setCurrentTeam: (teamId: string) => void | Promise<void>;
  plannerApi: typeof webPlannerApi;
  scheduleApi: typeof webScheduleApi;
};

const PlannerRuntimeContext = createContext<PlannerRuntime | null>(null);

export function PlannerRuntimeProvider({ runtime, children }: { runtime: PlannerRuntime; children: ReactNode }) {
  return <PlannerRuntimeContext.Provider value={runtime}>{children}</PlannerRuntimeContext.Provider>;
}

export function usePlannerRuntime(): PlannerRuntime {
  const runtime = useContext(PlannerRuntimeContext);
  if (!runtime) throw new Error('PlannerRuntimeProvider is required.');
  return runtime;
}
