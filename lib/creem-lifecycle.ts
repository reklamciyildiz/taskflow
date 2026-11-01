export function creemResumeEligibility(status: string): 'resume'|'terminal'|'already-active'|'blocked' {
  if(status==='scheduled_cancel'||status==='paused')return 'resume';
  if(status==='canceled'||status==='expired')return 'terminal';
  if(status==='active'||status==='trialing')return 'already-active';
  return 'blocked';
}
