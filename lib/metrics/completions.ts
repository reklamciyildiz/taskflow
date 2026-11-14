import type {Task} from '@/lib/types';

/**
 * A completed stage is not evidence of when an Action finished.
 * A verified database completion timestamp is required for any temporal statistic.
 */
export function verifiedCompletionAt(task:Pick<Task,'completedAt'|'createdAt'>):Date|null {
  const finished=task.completedAt;
  const created=task.createdAt;
  if(!(finished instanceof Date)||Number.isNaN(finished.getTime())||
     !(created instanceof Date)||Number.isNaN(created.getTime())||
     finished.getTime()<created.getTime())return null;
  return finished;
}

export function completedWithin(task:Pick<Task,'completedAt'|'createdAt'>,from:Date,to:Date):boolean {
  const done=verifiedCompletionAt(task);
  return done!==null&&done>=from&&done<=to;
}

export function completionDurationDays(task:Pick<Task,'completedAt'|'createdAt'>):number|null {
  const done=verifiedCompletionAt(task);
  return done===null?null:(done.getTime()-task.createdAt.getTime())/86_400_000;
}

export function completionCalendarDay(task:Pick<Task,'completedAt'|'createdAt'>):string|null {
  const done=verifiedCompletionAt(task);
  if(!done)return null;
  return `${done.getFullYear()}-${done.getMonth()}-${done.getDate()}`;
}
