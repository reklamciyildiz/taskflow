import type {Project,Task} from '@/lib/types';
import {resolveStageLifecycle} from '@/lib/stage-lifecycle';

/** Derived entirely from saved user Actions/Processes. No artificial onboarding milestones. */
export function calculateFirstSuccessProgress(input:{
  projects:readonly Project[];tasks:readonly Task[];teamId:string|null;
}) {
  const {projects,tasks,teamId}=input;
  const scoped=teamId?projects.filter(p=>!p.teamId||p.teamId===teamId):[];
  const byId=new Map(scoped.map(project=>[project.id,project]));
  const actual=teamId?tasks.filter(t=>t.teamId===teamId&&!!t.projectId&&byId.has(t.projectId)):[];
  const completed=actual.some(task=>{
    const project=byId.get(task.projectId!);
    return !!project&&resolveStageLifecycle(task.status,project.columnConfig).isTerminal;
  });
  const processCount=scoped.length;
  const taskCount=actual.length;
  const count=Number(processCount>0)+Number(taskCount>0)+Number(completed);
  return {
    count,complete:count===3,processCount,taskCount,hasCompletedAction:completed,
    projectId:scoped[0]?.id??null
  };
}
