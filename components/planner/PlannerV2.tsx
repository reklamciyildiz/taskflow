"use client";

import { useTaskContext } from '@/components/TaskContext';
import { plannerApi, scheduleApi } from '@/lib/api';
import { PlannerRuntimeProvider, type PlannerRuntime } from './PlannerRuntime';
import { PlannerV2View } from './PlannerV2View';

export { PlannerV2View } from './PlannerV2View';

/** Next.js adapter for the platform-neutral Planner presentation. */
export function PlannerV2() {
  const context = useTaskContext();
  const runtime: PlannerRuntime = {
    tasks: context.tasks,
    projects: context.projects,
    teams: context.teams,
    currentTeam: context.currentTeam,
    currentUser: context.currentUser,
    generalBoardColumns: context.generalBoardColumns,
    loading: context.loading,
    addTask: context.addTask,
    updateTask: context.updateTask,
    canCompleteTask: context.canCompleteTask,
    canEditTask: context.canEditTask,
    openTaskEditor: context.openTaskEditor,
    setCurrentTeam: context.setCurrentTeam,
    plannerApi,
    scheduleApi,
  };

  return (
    <PlannerRuntimeProvider runtime={runtime}>
      <PlannerV2View />
    </PlannerRuntimeProvider>
  );
}
