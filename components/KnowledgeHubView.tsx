'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTaskContext } from '@/components/TaskContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { BookOpen, FileText, Inbox, Search, Sparkles, LayoutGrid } from 'lucide-react';
import {
  buildKnowledgeEntries,
  formatKnowledgeEntryDate,
  knowledgeMapsFromContext,
  type KnowledgeEntryType,
  type KnowledgeHubEntry,
} from '@/lib/knowledge-entries';

export type { KnowledgeEntryType, KnowledgeHubEntry } from '@/lib/knowledge-entries';

export function KnowledgeHubView() {
  const router = useRouter();
  const { tasks, projects, teams, loading, openTaskEditor } = useTaskContext();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | KnowledgeEntryType>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const { projectNameById, teamNameById } = useMemo(
    () => knowledgeMapsFromContext(projects, teams),
    [projects, teams]
  );

  const allEntries = useMemo(
    () => buildKnowledgeEntries(tasks, projectNameById, teamNameById),
    [tasks, projectNameById, teamNameById]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEntries.filter((e) => {
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (projectFilter !== 'all') {
        if (projectFilter === '__none__') {
          if (e.projectId != null) return false;
        } else if (e.projectId !== projectFilter) return false;
      }
      if (!q) return true;
      const hay = [
        e.text,
        e.taskTitle,
        e.projectName ?? '',
        e.teamName,
        e.type === 'learning' ? 'öğrenme learnings' : 'günlük journal',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allEntries, query, typeFilter, projectFilter]);

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border bg-gradient-to-br from-violet-500/10 via-background to-cyan-500/10',
          'p-8 md:p-10 border-violet-200/50 dark:border-violet-900/40'
        )}
      >
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-3">
          <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-medium tracking-wide uppercase">Second brain</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Bilgi Merkezi</h1>
          <p className="text-muted-foreground max-w-2xl text-base leading-relaxed">
            Tüm süreçlerden öğrendiklerin ve günlük notların tek yerde. Arama ile mülakat cevaplarından teknik
            notlara kadar her şeyi bul. Bir kayda tıklayınca ilgili görev açılır.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Örn. slippage, mülakat, bug…"
            className="pl-10 h-11 bg-background"
            aria-label="Bilgi merkezi araması"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
          <SelectTrigger className="w-full sm:w-[180px] h-11">
            <SelectValue placeholder="Tür" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm türler</SelectItem>
            <SelectItem value="learning">Neler öğrendim</SelectItem>
            <SelectItem value="journal">Günlük notları</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-full sm:w-[220px] h-11">
            <SelectValue placeholder="Süreç" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm süreçler</SelectItem>
            <SelectItem value="__none__">Sürece bağlı değil</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Yükleniyor…</p>
      ) : allEntries.length === 0 ? (
        <Card className="border-dashed border-violet-200/70 dark:border-violet-900/50 overflow-hidden">
          <CardContent className="py-16 px-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-cyan-500/10 text-violet-600 dark:text-violet-400">
              <Inbox className="h-7 w-7" aria-hidden />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <p className="font-semibold text-foreground text-lg">Bilgi bankan henüz boş</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Henüz bir öğrenme veya günlük notu yok. Hadi bir görev açıp &quot;Neler öğrendim?&quot; alanına not ekle
                veya süreç günlüğüne bir satır yaz; kayıtların burada aranabilir şekilde birikecek.
              </p>
            </div>
            <Button variant="default" className="gap-2" onClick={() => router.push('/board')}>
              <LayoutGrid className="h-4 w-4" />
              Panoya git
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Bu filtrelere uygun kayıt yok</p>
            <p className="text-sm max-w-md mx-auto">
              Arama metnini sil, tür veya süreç filtresini &quot;Tümü&quot; yapmayı dene. Kayıtlar görevlerinde duruyor;
              silinmedi.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {filtered.map((entry) => (
            <li key={entry.id}>
              <Card
                role="button"
                tabIndex={0}
                onClick={() => openTaskEditor(entry.taskId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openTaskEditor(entry.taskId);
                  }
                }}
                className={cn(
                  'overflow-hidden transition-all hover:shadow-md cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  entry.type === 'learning'
                    ? 'border-l-4 border-l-emerald-500/80'
                    : 'border-l-4 border-l-amber-500/80'
                )}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={entry.type === 'learning' ? 'default' : 'secondary'}
                      className={cn(
                        'gap-1',
                        entry.type === 'learning' && 'bg-emerald-600 hover:bg-emerald-600'
                      )}
                    >
                      {entry.type === 'learning' ? (
                        <BookOpen className="h-3 w-3" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      {entry.type === 'learning' ? 'Öğrenme' : 'Günlük'}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {entry.teamName}
                    </Badge>
                    {entry.projectName ? (
                      <Badge variant="outline" className="font-normal bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:border-violet-800">
                        {entry.projectName}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal text-muted-foreground">
                        Süreç yok
                      </Badge>
                    )}
                    <Badge variant="secondary" className="font-normal truncate max-w-[200px] md:max-w-xs">
                      Görev: {entry.taskTitle}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                      {formatKnowledgeEntryDate(entry.sortDate)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{entry.text}</p>
                  <p className="text-xs text-muted-foreground">Görevi açmak için tıkla</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {!loading && allEntries.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {filtered.length} / {allEntries.length} kayıt
        </p>
      )}
    </div>
  );
}
