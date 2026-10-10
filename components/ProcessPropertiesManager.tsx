'use client';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { useProcessProperties } from '@/hooks/useProcessProperties';
import { PROPERTY_COLORS, orderedProperties, type PropertyColor, type PropertyCommand } from '@/lib/process-properties';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';

function EditableLabel({ value, disabled, onSave, label }: { value: string; disabled: boolean; onSave: (value: string) => Promise<boolean>; label: string }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);
  return <Input value={draft} onChange={event => setDraft(event.target.value)} maxLength={80} disabled={disabled || saving} aria-label={label} className="h-8 min-w-0"
    onBlur={async () => {
      if (draft.trim() === value || saving) return;
      setSaving(true);
      if (!await onSave(draft)) setDraft(value);
      setSaving(false);
    }}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); } }} />;
}
export function ProcessPropertiesManager({ projectId, teamId }: { projectId: string; teamId: string }) {
  const { data, error, loading, busy, mutate, reload } = useProcessProperties(projectId, teamId);
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [archive, setArchive] = useState<PropertyCommand | null>(null);
  const execute = async (command: PropertyCommand) => {
    try { await mutate(command); return true; }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Property could not be saved'); return false; }
  };
  const move = (ids: string[], index: number, offset: number, propertyId: string | null) => {
    const next = [...ids];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    void execute({ operation: 'reorder', propertyId, ids: next });
  };
  if (loading) return <p className="text-xs text-muted-foreground">Loading properties…</p>;
  if (error) return <p className="text-xs text-destructive">{error} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p>;
  if (!data) return null;
  const properties = data.properties.filter(p => !p.archived_at);
  const disabled = busy || !data.canManage;
  const addProperty = async () => { if (name.trim() && await execute({ operation: 'create_property', name })) setName(''); };
  return <section className="space-y-3 rounded-lg border border-border/60 p-3" aria-label="Process properties">
    <div><h3 className="text-sm font-medium">Properties</h3><p className="text-xs text-muted-foreground">Single-select fields for this process. Changes save separately.</p></div>
    {properties.map((property, index) => {
      const options = orderedProperties(data.options.filter(o => o.property_id === property.id && !o.archived_at));
      const addOption = async () => {
        if (drafts[property.id]?.trim() && await execute({ operation: 'create_option', propertyId: property.id, label: drafts[property.id], color: 'slate' })) {
          setDrafts(previous => ({ ...previous, [property.id]: '' }));
        }
      };
      return <div key={property.id} className="space-y-2 rounded-md border border-border/50 p-2">
        <div className="flex items-center gap-1">
          <EditableLabel value={property.name} label="Property name" disabled={disabled} onSave={name => execute({ operation: 'rename_property', id: property.id, name })} />
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Move property up" disabled={disabled || index === 0} onClick={() => move(properties.map(p => p.id), index, -1, null)}><ArrowUp className="h-3 w-3" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Move property down" disabled={disabled || index === properties.length - 1} onClick={() => move(properties.map(p => p.id), index, 1, null)}><ArrowDown className="h-3 w-3" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Archive property" disabled={disabled} onClick={() => setArchive({ operation: 'archive_property', id: property.id })}><Archive className="h-3 w-3" /></Button>
        </div>
        {options.map((option, optionIndex) => <div key={option.id} className="flex items-center gap-1 pl-2">
          <EditableLabel label="Option label" value={option.label} disabled={disabled} onSave={label => execute({ operation: 'update_option', id: option.id, label, color: option.color })} />
          <select aria-label={`Color for ${option.label}`} value={option.color} disabled={disabled} className="h-8 max-w-[90px] rounded border bg-background px-1 text-xs"
            onChange={event => void execute({ operation: 'update_option', id: option.id, label: option.label, color: event.target.value as PropertyColor })}>
            {PROPERTY_COLORS.map(color => <option key={color} value={color}>{color}</option>)}
          </select>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-7 shrink-0" aria-label="Move option up" disabled={disabled || optionIndex === 0} onClick={() => move(options.map(o => o.id), optionIndex, -1, property.id)}><ArrowUp className="h-3 w-3" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-7 shrink-0" aria-label="Move option down" disabled={disabled || optionIndex === options.length - 1} onClick={() => move(options.map(o => o.id), optionIndex, 1, property.id)}><ArrowDown className="h-3 w-3" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-7 shrink-0" aria-label="Archive option" disabled={disabled} onClick={() => setArchive({ operation: 'archive_option', id: option.id })}><Archive className="h-3 w-3" /></Button>
        </div>)}
        {data.canManage && <div className="flex gap-2 pl-2"><Input className="h-8" placeholder="Add option…" aria-label={`New option for ${property.name}`} value={drafts[property.id] ?? ''} maxLength={80} disabled={busy}
          onChange={event => setDrafts(previous => ({ ...previous, [property.id]: event.target.value }))}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void addOption(); } }} />
          <Button type="button" size="sm" variant="outline" disabled={busy || !drafts[property.id]?.trim()} onClick={() => void addOption()}>Add</Button></div>}
        {data.options.some(o => o.property_id === property.id && o.archived_at) && <p className="text-xs text-muted-foreground">Archived: {data.options.filter(o => o.property_id === property.id && o.archived_at).map(o => o.label).join(', ')}</p>}
      </div>;
    })}
    {data.canManage && <div className="flex gap-2"><Input placeholder="New property, e.g. Region" aria-label="New property name" value={name} maxLength={80} disabled={busy} onChange={event => setName(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void addProperty(); } }} />
      <Button type="button" variant="outline" disabled={busy || !name.trim()} onClick={() => void addProperty()}>Add property</Button></div>}
    {data.properties.some(p => p.archived_at) && <p className="text-xs text-muted-foreground">Archived properties: {data.properties.filter(p => p.archived_at).map(p => p.name).join(', ')}</p>}
    <AlertDialog open={!!archive} onOpenChange={open => { if (!open) setArchive(null); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Archive this field or option?</AlertDialogTitle><AlertDialogDescription>Existing Action values will be kept and shown as archived. It cannot be assigned to new Actions.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (archive) void execute(archive); setArchive(null); }}>Archive</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
