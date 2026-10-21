import type { ReactNode } from 'react';
import { Check, ChevronRight, Circle, FolderKanban, ListChecks, Star } from 'lucide-react';

export type AxiomProcessListItem = {
  id: string;
  name: string;
  activeActionCount: number;
  totalActionCount?: number;
  visibility?: string;
  updatedLabel?: string;
  pinned?: boolean;
};

export type AxiomActionListItem = {
  id: string;
  title: string;
  contextLabel?: string;
  stageLabel?: string;
  priorityLabel?: string;
  checklistLabel?: string;
  completed?: boolean;
};

function EntityButton({
  icon,
  title,
  metadata,
  onOpen,
  disabled,
  completed,
  trailing,
}: {
  icon: ReactNode;
  title: string;
  metadata?: ReactNode;
  onOpen: () => void;
  disabled?: boolean;
  completed?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="axiom-entity-row">
      <button className="axiom-entity-main" type="button" onClick={onOpen} disabled={disabled}>
        <span className={`axiom-entity-icon${completed ? ' is-complete' : ''}`}>{icon}</span>
        <span className="axiom-entity-copy">
          <strong className={completed ? 'is-complete' : undefined}>{title}</strong>
          {metadata ? <span className="axiom-entity-meta">{metadata}</span> : null}
        </span>
        {!trailing ? <ChevronRight className="axiom-entity-chevron" aria-hidden="true" /> : null}
      </button>
      {trailing}
    </div>
  );
}

export function AxiomProcessList({
  items,
  onOpen,
  onTogglePin,
  disabled,
}: {
  items: AxiomProcessListItem[];
  onOpen: (id: string) => void;
  onTogglePin?: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="axiom-entity-list">
      {items.map((item) => (
        <EntityButton
          key={item.id}
          icon={<FolderKanban />}
          title={item.name}
          onOpen={() => onOpen(item.id)}
          disabled={disabled}
          metadata={(
            <>
              <span className="axiom-entity-meta-strong">{item.activeActionCount} active</span>
              {item.totalActionCount !== undefined ? <span>{item.totalActionCount} Actions</span> : null}
              {item.updatedLabel ? <span>{item.updatedLabel}</span> : null}
              {item.visibility ? <span className="axiom-entity-badge">{item.visibility}</span> : null}
            </>
          )}
          trailing={onTogglePin ? (
            <button
              className={`axiom-entity-pin${item.pinned ? ' is-pinned' : ''}`}
              type="button"
              onClick={() => onTogglePin(item.id)}
              disabled={disabled}
              aria-label={`${item.pinned ? 'Unpin' : 'Pin'} ${item.name}`}
            >
              <Star aria-hidden="true" />
            </button>
          ) : undefined}
        />
      ))}
    </div>
  );
}

export function AxiomActionList({
  items,
  onOpen,
  disabled,
}: {
  items: AxiomActionListItem[];
  onOpen: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="axiom-entity-list">
      {items.map((item) => (
        <EntityButton
          key={item.id}
          icon={item.completed ? <Check /> : <ListChecks />}
          title={item.title}
          onOpen={() => onOpen(item.id)}
          disabled={disabled}
          completed={item.completed}
          metadata={(
            <>
              {item.contextLabel ? <span>{item.contextLabel}</span> : null}
              {item.stageLabel ? <span>{item.stageLabel}</span> : null}
              {item.checklistLabel ? <span>{item.checklistLabel}</span> : null}
              {item.priorityLabel ? <span className="axiom-entity-badge">{item.priorityLabel}</span> : null}
            </>
          )}
        />
      ))}
    </div>
  );
}

export function AxiomChecklistList({
  items,
}: {
  items: Array<{ id: string; text: string; checked: boolean }>;
}) {
  return (
    <div className="axiom-checklist-list">
      {items.map((item) => (
        <div key={item.id} className={`axiom-checklist-row${item.checked ? ' is-complete' : ''}`}>
          <span className="axiom-checklist-mark">{item.checked ? <Check /> : <Circle />}</span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
