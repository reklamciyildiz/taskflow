'use client';
import { toast } from 'sonner';
import { useProcessProperties } from '@/hooks/useProcessProperties';
import { PROPERTY_COLOR_CLASSES } from '@/lib/process-properties';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export function ActionPropertyFields({ taskId, projectId, teamId, canEdit }: { taskId: string; projectId: string; teamId: string; canEdit: boolean }) {
  const { data, error, loading, busy, setValue, reload } = useProcessProperties(projectId, teamId);
  if (loading) return <p className="text-xs text-muted-foreground sm:col-span-2">Loading properties…</p>;
  if (error) return <p className="text-xs text-destructive sm:col-span-2">{error} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p>;
  if (!data) return null;
  const selected = new Map(data.values.filter(v => v.task_id === taskId).map(v => [v.property_id, v.option_id]));
  return <>{data.properties.filter(p => !p.archived_at || selected.has(p.id)).map(property => {
    const options = data.options.filter(o => o.property_id === property.id && (!o.archived_at || o.id === selected.get(property.id)));
    return <div key={property.id} className="space-y-1.5">
      <Label className="text-[11px] uppercase text-muted-foreground">{property.name}{property.archived_at ? ' (archived)' : ''}</Label>
      <Select value={selected.get(property.id) ?? '__none__'} disabled={!canEdit || busy}
        onValueChange={value => { void setValue(taskId, property.id, value === '__none__' ? null : value).catch(error => toast.error(error.message)); }}>
        <SelectTrigger aria-label={property.name} className="h-9 border-border/60 bg-background/80"><SelectValue placeholder="Unassigned" /></SelectTrigger>
        <SelectContent><SelectItem value="__none__">Unassigned</SelectItem>
          {options.map(option => <SelectItem key={option.id} value={option.id} disabled={!!option.archived_at || !!property.archived_at}>
            <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${PROPERTY_COLOR_CLASSES[option.color]}`} />{option.label}{option.archived_at ? ' (archived)' : ''}</span>
          </SelectItem>)}
        </SelectContent>
      </Select>
    </div>;
  })}</>;
}
