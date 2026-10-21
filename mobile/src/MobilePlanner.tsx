import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronRight, Clock3, ListChecks, RefreshCw, Repeat2 } from 'lucide-react';
import type { MobilePlannerItem, MobilePlannerToday } from '../../shared/mobile-contracts';
import { loadPlannerToday } from './mobile-api';

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function PlannerRow({ item, onOpen }: { item: MobilePlannerItem; onOpen: (id: string) => void }) {
  const title = item.sourceType === 'checklist_item' ? item.checklistItemText || item.taskTitle : item.taskTitle;
  return (
    <button className="planner-item" type="button" onClick={() => onOpen(item.taskId)}>
      <span className={`planner-check${item.state === 'completed' ? ' is-complete' : ''}`}>
        {item.state === 'completed' ? <Check /> : <span />}
      </span>
      <span className="planner-item-copy">
        <strong>{title}</strong>
        <small>
          <span>{item.sourceType === 'checklist_item' ? 'Checklist' : 'Action'}</span>
          {item.processName ? <span>{item.processName}</span> : <span>General</span>}
          {item.recurring ? <span className="meta-accent"><Repeat2 />Recurring</span> : null}
        </small>
      </span>
      <span className="planner-time">{item.scheduleTime?.slice(0, 5) ?? 'All day'}</span>
      <ChevronRight className="chevron" />
    </button>
  );
}

function PlannerGroup({ title, tone, items, onOpen }: {
  title: string;
  tone?: 'danger' | 'success';
  items: MobilePlannerItem[];
  onOpen: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="agenda-group">
      <div className={`agenda-heading${tone ? ` ${tone}` : ''}`}><span>{title}</span><strong>{items.length}</strong></div>
      <div className="agenda-list">{items.map((item) => <PlannerRow key={item.id} item={item} onOpen={onOpen} />)}</div>
    </section>
  );
}

export function MobilePlanner({ onOpenAction, onError }: {
  onOpenAction: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<MobilePlannerToday | null>(null);
  const [loading, setLoading] = useState(true);
  const date = useMemo(localDate, []);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await loadPlannerToday(date, timeZone)); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Planner could not be loaded.'); }
    finally { setLoading(false); }
  }, [date, onError, timeZone]);
  useEffect(() => { void load(); }, [load]);

  const total = (data?.overdue.length ?? 0) + (data?.today.length ?? 0);
  return (
    <section className="workspace mobile-product-view" aria-labelledby="mobile-planner-title">
      <div className="product-heading">
        <div><p className="eyebrow"><CalendarDays />Daily plan</p><h1 id="mobile-planner-title">Today</h1><p className="summary">Canonical schedules, recurring occurrences, and Checklist work in one place.</p></div>
        <button className="icon-button quiet" type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh Planner"><RefreshCw className={loading ? 'spin' : ''} /></button>
      </div>
      <div className="planner-summary"><div><Clock3 /><span><strong>{total}</strong> open today</span></div><div><Check /><span><strong>{data?.completedToday.length ?? 0}</strong> completed</span></div></div>
      {loading && !data ? <div className="mobile-skeleton-list"><span /><span /><span /></div> : null}
      {data ? <>
        <PlannerGroup title="Overdue" tone="danger" items={data.overdue} onOpen={onOpenAction} />
        <PlannerGroup title="Today" items={data.today} onOpen={onOpenAction} />
        <PlannerGroup title="Completed" tone="success" items={data.completedToday} onOpen={onOpenAction} />
        {!total && !data.completedToday.length ? <div className="empty premium-empty"><CalendarDays /><strong>Your day is clear</strong><span>Scheduled Actions and Checklist items will appear here.</span></div> : null}
      </> : null}
    </section>
  );
}
