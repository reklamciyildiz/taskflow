// Isolated browser fixture: real Board/Table/menus/property hook, fake authenticated workspace.
// Never imported by the application. Network responses are supplied by the QA runner.
import React, { createContext, useContext, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { TaskBoard } from '../../components/TaskBoard';
import { TaskList } from '../../components/TaskList';
import { PlannerToday } from '../../components/PlannerToday';
import { OptimisticTaskWrites } from '../../lib/optimistic-task-writes';
import type { Task } from '../../lib/types';

const Context = createContext<any>(null);
export const useTaskContext = () => useContext(Context);
export const CreateTaskModal = () => null;
export const CreateProjectModal = () => null;
export const EditGeneralBoardModal = () => null;
export const VoiceToTaskButton = () => null;

const columns = [
  { id: 'open', title: 'Yapılacaklar', isTerminal: false },
  { id: 'category', title: 'İşimiz Bitti', isTerminal: false }, // Name alone must NOT close work.
  { id: 'closed', title: 'Kabul edildi', isTerminal: true },
  { id: 'rejected', title: 'Reddedildi', isTerminal: true },
  { id: 'empty', title: 'Empty group', isTerminal: false },
];
const projects = [{ id: 'p1', teamId: 'team', name: 'SmartSafe AI', columnConfig: columns },
  { id: 'p2', teamId: 'team', name: 'Other Process', columnConfig: [{ id: 'other', title: 'Other stage' }] }];
const seed = [
  { id: 'a', title: 'Open Action', status: 'open' },
  { id: 'b', title: 'Closed Action', status: 'closed' },
  { id: 'c', title: 'Category Action', status: 'category' },
  { id: 'd', title: 'Long Action ' + 'unbrokenlongtitle'.repeat(18), status: 'open' },
  ...Array.from({ length: 7 }, (_, i) => ({ id: `dense${i}`, title: `Dense Action ${i}`, status: 'open' })),
  { id: 'other', title: 'Other Process Action', status: 'other', projectId: 'p2' },
].map((task, i) => ({ description: '', priority: 'low', projectId: 'p1', teamId: 'team', createdBy: 'user',
  attachments: [], comments: [], createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-01'),
  boardPosition: i, ...task })) as Task[];

function Fixture() {
  const [processes, setProcesses] = useState(projects);
  const [tasks, setTasks] = useState(seed);
  const taskRef = useRef(tasks); taskRef.current = tasks;
  const queue = useRef(new OptimisticTaskWrites<Task>());
  const [scope, setScope] = useState({ type: 'project', projectId: 'p1' });
  const [surface, setSurface] = useState('table');
  const [editor, setEditor] = useState<string | null>(null);
  const [viewer, setViewer] = useState(false);
  const [filter, setFilter] = useState(null);
  const project = processes.find(p => p.id === scope.projectId)!;
  const updateTask = async (id: string, changes: Partial<Task>) => {
    const base = taskRef.current.find(task => task.id === id)!;
    return queue.current.enqueue(id, base, changes,
      patch => setTasks(current => current.map(task => task.id === id ? { ...task, ...patch } : task)),
      async () => (await fetch(`/fixture/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(changes) })).ok);
  };
  (window as any).qa = {
    tasks, setViewer, setSurface,
    setDone: (done: boolean) => setProcesses(current => current.map(process => process.id === 'p1'
      ? { ...process, columnConfig: process.columnConfig.map(column => column.id === 'open' ? { ...column, isTerminal: done } : column) } : process)),
    setRecurring: () => setTasks(current => current.map(task => task.id === 'a' ? { ...task, schedule: {
      id: 'recurring', organizationId: 'org', teamId: 'team', source: { sourceType: 'action', taskId: 'a' },
      scheduleType: 'recurring', scheduleDate: '2026-10-11', scheduleTime: null, timeZone: null,
      recurrenceFrequency: 'daily', recurrenceInterval: 1, recurrenceWeekdays: [], endsOn: null,
      reminderRules: [], archivedAt: null, createdAt: '', updatedAt: '',
    } } : task)),
    edit: updateTask,
  };
  const context = { tasks, currentTeam: { id: 'team', members: [{ id: 'user', name: 'Yiğit' }] },
    currentUser: { id: 'user' }, organizationId: 'org', boardScope: scope, setBoardScope: setScope,
    boardProject: project, projects: processes, boardColumns: project.columnConfig, currentUserRole: viewer ? 'viewer' : 'admin',
    permissions: { canCreateTask: !viewer }, canEditTask: () => !viewer, canCompleteTask: () => !viewer,
    canDeleteTask: () => false, updateTask, deleteTask: async () => {}, openTaskEditor: setEditor,
    applyTaskUpdates: async (items: any[]) => (await Promise.all(items.map(item => updateTask(item.id, item.changes)))).every(Boolean),
    loading: false, filter, setFilter, customers: [], customerFilter: null, setCustomerFilter: () => {},
    customerDirectoryLabel: 'Clients', customerSingularLabel: 'Client', suppressTaskEditorOpenFor: () => {},
  };
  return <Context.Provider value={context}>
    <nav style={{ display: 'flex', gap: 12, padding: 8 }}>
      <button onClick={() => setSurface('board')}>Board fixture</button>
      <button onClick={() => setSurface('table')}>Table fixture</button>
    </nav>
    <main style={{ padding: 12, minWidth: 0 }}>{surface === 'board' ? <TaskBoard /> : surface === 'planner' ? <PlannerToday /> : <TaskList />}</main>
    {editor && <div role="dialog" aria-label="Action context" style={{ position: 'fixed', inset: 20, background: '#1e293b', padding: 20, zIndex: 999 }}>
      <button onClick={() => setEditor(null)}>Close Action</button>
      <p>{tasks.find(task => task.id === editor)?.title}</p>
      <p data-testid="context-status">{tasks.find(task => task.id === editor)?.status}</p>
    </div>}
    <Toaster />
  </Context.Provider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>);
