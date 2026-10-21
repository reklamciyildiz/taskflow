import type { ReactNode } from 'react';
import {
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
} from 'lucide-react';
import type {
  MobileActionDetail,
  MobileProcessDetail,
  MobileWorkspace,
} from '../mobile-contracts';
import { AxiomActionList, AxiomChecklistList, AxiomProcessList } from './AxiomWorkspaceLists';

function priorityLabel(priority: string | null): string {
  return priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : 'Normal';
}

export function AxiomChecklistProgress({
  completed,
  total,
  compact = false,
}: {
  completed: number;
  total: number;
  compact?: boolean;
}) {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const complete = total > 0 && completed === total;
  return (
    <div className={`axiom-checklist-progress${compact ? ' is-compact' : ''}`}>
      {!compact ? (
        <div className="axiom-checklist-progress-copy">
          <span>Checklist progress</span>
          <strong>{completed}/{total}</strong>
        </div>
      ) : null}
      <div
        className="axiom-checklist-progress-track"
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <span className={complete ? 'is-complete' : undefined} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function AxiomProductSection({
  eyebrow,
  title,
  count,
  action,
  children,
  className = '',
}: {
  eyebrow?: string;
  title: string;
  count?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`axiom-product-section ${className}`.trim()}>
      <header className="axiom-product-section-header">
        <div className="axiom-product-section-heading">
          {eyebrow ? <p>{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ?? (count !== undefined ? <span className="axiom-product-section-count">{count}</span> : null)}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="axiom-product-empty">{icon}<div><strong>{title}</strong><span>{detail}</span></div></div>;
}

export function AxiomWorkspaceDashboard({
  workspace,
  greeting,
  dateLabel,
  onRefresh,
  onOpenProcess,
  onOpenAction,
  busy,
  footer,
}: {
  workspace: MobileWorkspace;
  greeting: string;
  dateLabel: string;
  onRefresh: () => void;
  onOpenProcess: (id: string) => void;
  onOpenAction: (id: string) => void;
  busy?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className="axiom-workspace-view" aria-labelledby="workspace-title">
      <div className="axiom-product-hero">
        <div>
          <p className="axiom-product-eyebrow">{dateLabel}</p>
          <h1 id="workspace-title">{greeting}</h1>
          <p className="axiom-product-summary">Your work, organized around what matters now.</p>
        </div>
        <button className="axiom-product-icon-button" type="button" onClick={onRefresh} disabled={busy} aria-label="Refresh workspace">
          <RefreshCw className={busy ? 'spin' : ''} />
        </button>
      </div>

      <section className="axiom-overview" aria-label="Workspace overview">
        <div><strong>{workspace.processes.length}</strong><span>Visible Processes</span></div>
        <div><strong>{workspace.recentActions.length}</strong><span>Recent Actions</span></div>
        <span className="axiom-overview-icon"><LayoutDashboard /></span>
      </section>

      <AxiomProductSection eyebrow="Workspace" title="Processes" count={workspace.processes.length}>
        {workspace.processes.length ? (
          <AxiomProcessList items={workspace.processes} onOpen={onOpenProcess} disabled={busy} />
        ) : (
          <EmptyState icon={<FolderKanban />} title="No accessible Processes" detail="Your permitted workspace Processes will appear here." />
        )}
      </AxiomProductSection>

      <AxiomProductSection eyebrow="Recently updated" title="Actions" count={workspace.recentActions.length}>
        {workspace.recentActions.length ? (
          <AxiomActionList
            items={workspace.recentActions.map((action) => ({
              id: action.id,
              title: action.title,
              contextLabel: action.projectName,
              priorityLabel: priorityLabel(action.priority),
            }))}
            onOpen={onOpenAction}
            disabled={busy}
          />
        ) : (
          <EmptyState icon={<ListChecks />} title="No recent Actions" detail="Recently updated work will appear here." />
        )}
      </AxiomProductSection>
      {footer}
    </section>
  );
}

export function AxiomProcessView({
  detail,
  onOpenAction,
  busy,
}: {
  detail: MobileProcessDetail;
  onOpenAction: (id: string) => void;
  busy?: boolean;
}) {
  const actionsByStage = detail.actions.reduce<Array<{ stage: string; actions: typeof detail.actions }>>((groups, action) => {
    const stage = action.stageLabel || 'Uncategorized';
    const existing = groups.find((group) => group.stage === stage);
    if (existing) existing.actions.push(action);
    else groups.push({ stage, actions: [action] });
    return groups;
  }, []);
  return (
    <section className="axiom-workspace-view axiom-detail-view" aria-labelledby="process-title">
      <div className="axiom-detail-hero">
        <span className="axiom-detail-icon"><FolderKanban /></span>
        <p className="axiom-product-eyebrow">Process</p>
        <h1 id="process-title">{detail.process.name}</h1>
        <p className="axiom-product-summary">{detail.process.visibility} workspace</p>
      </div>
      <div className="axiom-detail-metrics">
        <div><strong>{detail.process.activeActionCount}</strong><span>Active</span></div>
        <div><strong>{detail.totalActions}</strong><span>Total Actions</span></div>
      </div>
      <AxiomProductSection eyebrow="Current work" title="Actions" count={detail.hasMore ? '50+' : detail.actions.length}>
        {detail.actions.length ? (
          <div className="axiom-stage-groups">
            {actionsByStage.map((group) => (
              <section className="axiom-stage-group" key={group.stage} aria-label={`${group.stage} Actions`}>
                <header><span>{group.stage}</span><span>{group.actions.length}</span></header>
                <AxiomActionList
                  items={group.actions.map((action) => ({
                    id: action.id,
                    title: action.title,
                    checklistLabel: `${action.checklist.completed}/${action.checklist.total} Checklist`,
                    completed: action.completed,
                  }))}
                  onOpen={onOpenAction}
                  disabled={busy}
                />
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon={<ListChecks />} title="No accessible Actions" detail="This Process has no Actions you can view." />
        )}
      </AxiomProductSection>
    </section>
  );
}

export function AxiomActionView({ detail }: { detail: MobileActionDetail }) {
  const completed = detail.checklist.filter((item) => item.checked).length;
  return (
    <section className="axiom-workspace-view axiom-detail-view" aria-labelledby="action-title">
      <div className="axiom-detail-hero">
        <p className="axiom-product-context">{detail.process?.name ?? 'General'}</p>
        <p className="axiom-product-eyebrow">Action</p>
        <h1 id="action-title">{detail.title}</h1>
        <div className="axiom-product-meta"><span>{detail.stageLabel}</span><span>{priorityLabel(detail.priority)}</span></div>
      </div>
      {detail.description ? <section className="axiom-description"><p className="axiom-product-eyebrow">Description</p><p>{detail.description}</p></section> : null}
      <AxiomProductSection eyebrow="Progress" title="Checklist" count={`${completed}/${detail.checklist.length}`}>
        {detail.checklist.length ? (
          <>
            <AxiomChecklistProgress completed={completed} total={detail.checklist.length} />
            <AxiomChecklistList items={detail.checklist} />
          </>
        ) : (
          <EmptyState icon={<ListChecks />} title="No Checklist items" detail="This Action does not have a Checklist yet." />
        )}
      </AxiomProductSection>
    </section>
  );
}
