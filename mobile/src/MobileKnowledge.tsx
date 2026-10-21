import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight, FileText, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { MobileKnowledgeEntry } from '../../shared/mobile-contracts';
import { loadKnowledge } from './mobile-api';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function MobileKnowledge({ onOpenAction, onError }: {
  onOpenAction: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [entries, setEntries] = useState<MobileKnowledgeEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await loadKnowledge()); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Knowledge could not be loaded.'); }
    finally { setLoading(false); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return entries;
    return entries.filter((entry) => `${entry.title} ${entry.excerpt} ${entry.actionTitle} ${entry.processName ?? ''}`.toLocaleLowerCase().includes(normalized));
  }, [entries, query]);

  return (
    <section className="workspace mobile-product-view" aria-labelledby="mobile-knowledge-title">
      <div className="product-heading">
        <div><p className="eyebrow"><Sparkles />Second brain</p><h1 id="mobile-knowledge-title">Knowledge</h1><p className="summary">Recent Notes and decisions from work you are authorized to see.</p></div>
        <button className="icon-button quiet" type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh Knowledge"><RefreshCw className={loading ? 'spin' : ''} /></button>
      </div>
      <label className="mobile-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Notes and decisions" aria-label="Search Knowledge" /></label>
      {loading && !entries.length ? <div className="mobile-skeleton-list"><span /><span /><span /></div> : null}
      {!loading && !filtered.length ? <div className="empty premium-empty"><BookOpen /><strong>{query ? 'No matching knowledge' : 'No Knowledge yet'}</strong><span>{query ? 'Try a broader search.' : 'Notes attached to accessible Actions will appear here.'}</span></div> : null}
      <div className="knowledge-list">{filtered.map((entry) => (
        <button className="knowledge-row" type="button" key={entry.id} onClick={() => onOpenAction(entry.actionId)}>
          <span className="knowledge-icon"><FileText /></span>
          <span className="knowledge-copy"><span className="knowledge-meta"><em>{entry.type}</em><time>{formatDate(entry.updatedAt)}</time></span><strong>{entry.title || entry.actionTitle}</strong>{entry.excerpt ? <span>{entry.excerpt}</span> : null}<small>{entry.processName ?? 'General'} · {entry.actionTitle}</small></span>
          <ChevronRight className="chevron" />
        </button>
      ))}</div>
    </section>
  );
}
