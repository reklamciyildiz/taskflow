'use client';

import { useEffect, useMemo, useState } from 'react';
import { useView } from '@/components/ViewContext';
import { useTaskContext } from '@/components/TaskContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { DeleteProjectModal } from '@/components/DeleteProjectModal';
import { Layers, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ProcessesPage() {
  const { setCurrentView } = useView();
  const { projects, currentTeam, refreshData, currentProject, setCurrentProjectId } = useTaskContext();
  const [query, setQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentView('processes');
  }, [setCurrentView]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const teamId = currentTeam?.id ?? null;
    const scoped = teamId ? projects.filter((p) => !p.teamId || p.teamId === teamId) : projects;
    if (!q) return scoped;
    return scoped.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, currentTeam?.id, query]);

  const deletingProject = useMemo(() => {
    if (!deletingProjectId) return null;
    const p = projects.find((x) => x.id === deletingProjectId);
    if (!p) return null;
    return { id: p.id, name: p.name, columnCount: p.columnConfig?.length ?? 0 };
  }, [deletingProjectId, projects]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Süreç Merkezi
          </h1>
          <p className="text-sm text-muted-foreground">
            Süreçleri (pipeline) burada yönet: oluştur, düzenle, sil. Değişiklikler panodaki kolonları anında etkiler.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Yeni süreç
        </Button>
      </div>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-3">
            <span>Süreçler</span>
            <Badge variant="secondary">{visible.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Süreç ara…"
              className="pl-9"
            />
          </div>

          {visible.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center space-y-2 bg-muted/30">
              <p className="text-sm font-medium text-foreground">Henüz süreç yok</p>
              <p className="text-sm text-muted-foreground">
                Bir süreç oluşturup kolonlarını tanımla; sonra panoda süreç seçerek görevleri o akışa bağla.
              </p>
              <Button variant="outline" onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Süreç oluştur
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {visible.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-xl border p-4 bg-background/60 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{p.name}</p>
                      {currentProject?.id === p.id && (
                        <Badge variant="default" className="h-5 text-[10px]">
                          Seçili
                        </Badge>
                      )}
                      {p.teamId ? (
                        <Badge variant="outline" className="h-5 text-[10px]">
                          Takım
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                          Genel
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p.columnConfig?.length ?? 0} kolon
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setCurrentProjectId(p.id)}
                    >
                      <Settings2 className="h-4 w-4" />
                      Panoda seç
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                      onClick={() => setEditingProjectId(p.id)}
                    >
                      <Settings2 className="h-4 w-4" />
                      Düzenle
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-red-600 hover:text-red-700"
                      onClick={() => setDeletingProjectId(p.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Sil
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateProjectModal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      {editingProjectId && (
        <CreateProjectModal
          open={!!editingProjectId}
          onClose={() => setEditingProjectId(null)}
          mode="edit"
          projectId={editingProjectId}
        />
      )}
      <DeleteProjectModal
        project={deletingProject}
        open={!!deletingProjectId}
        onClose={() => setDeletingProjectId(null)}
        onConfirm={async (projectId: string) => {
          const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || 'Failed to delete process');
          if (currentProject?.id === projectId) setCurrentProjectId(null);
          await refreshData();
          toast.success('Süreç silindi');
          setDeletingProjectId(null);
        }}
      />
    </div>
  );
}

