import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTaskContext } from '../../components/TaskContext';

export function MobileListView() {
  const { tasks, currentTeam, projects, boardColumns, generalBoardColumns, openTaskEditor } = useTaskContext();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    if (!currentTeam) return [];
    const text = query.trim().toLocaleLowerCase();
    return tasks.filter(task => task.teamId === currentTeam.id
      && (!text || task.title.toLocaleLowerCase().includes(text) || task.description?.toLocaleLowerCase().includes(text)))
      .sort((a, b) => {
        const ad = a.dueDate instanceof Date ? a.dueDate.getTime() : Infinity;
        const bd = b.dueDate instanceof Date ? b.dueDate.getTime() : Infinity;
        return ad - bd || a.title.localeCompare(b.title);
      });
  }, [tasks, currentTeam, query]);
  const projectById = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);
  return (
    <section className="workspace mobile-product-view mobile-list-view" aria-label="Action list">
      <div className="mobile-list-heading"><h1>List View</h1><span>{visible.length} Actions</span></div>
      <p className="mobile-more-subtitle">All accessible Actions in {currentTeam?.name ?? 'your workspace'}.</p>
      <label className="mobile-list-search"><Search aria-hidden="true" /><input type="search" aria-label="Search actions" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search Actions" /></label>
      <div className="mobile-list-items">
        {visible.map(task => {
          const process = task.projectId ? projectById.get(task.projectId) : null;
          const stages = process?.columnConfig ?? (task.projectId ? boardColumns : generalBoardColumns);
          const stage = stages.find(item => item.id === task.status);
          return (
            <button key={task.id} type="button" className="mobile-list-item" onClick={() => openTaskEditor(task.id)}>
              <strong>{task.title}</strong>
              <span>{process?.name ?? 'Inbox'} · {stage?.title ?? task.status} · {task.priority ?? 'Medium'}</span>
            </button>
          );
        })}
        {visible.length === 0 ? <div className="mobile-list-empty">No Actions match your search in this team.</div> : null}
      </div>
    </section>
  );
}
