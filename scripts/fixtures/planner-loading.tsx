import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PlannerToday } from '../../components/PlannerToday';

// Resolved bootstrap scope with deliberately delayed unrelated Board data.
let loading = true;
let render: () => void;
const team = { id: 'team-qa', members: [] };
const projects = [{ id: 'project-qa', teamId: team.id, columnConfig: [{ id: 'todo', isTerminal: false }] }];
const tasks = [{ id: 'task-qa', teamId: team.id, updatedAt: new Date() }];
const qa: any = (window as any).qa = { calls: [], start: performance.now() };
export function useTaskContext() {
  return { tasks: loading ? [] : tasks, projects: loading ? [] : projects, currentTeam: team, loading,
    updateTask: async () => true, openTaskEditor: () => undefined,
    canCompleteTask: () => true, canEditTask: () => true };
}
window.fetch = (async (input: string) => {
  qa.calls.push({ input, at: performance.now() - qa.start });
  await new Promise(resolve => setTimeout(resolve, 150));
  const date = new URL(input, location.origin).searchParams.get('date');
  return new Response(JSON.stringify({ success: true, data: { date, overdue: [], today: [], completedToday: [] } }),
    { headers: { 'Content-Type': 'application/json' } });
}) as any;
function Fixture() {
  const [, update] = useState(0);
  const [shown, show] = useState(true);
  render = () => update(value => value + 1);
  qa.finishBootstrap = () => { loading = false; render(); };
  qa.navigate = (visible: boolean) => show(visible);
  return shown ? <PlannerToday /> : null;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
