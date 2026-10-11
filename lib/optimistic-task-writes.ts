/** Serialize writes per Action, while rendering queued edits immediately.
 * Rollbacks project only touched fields, never restore the whole task/list. */
export class OptimisticTaskWrites<T extends object> {
  private entries = new Map<string, { base: T; keys: Set<keyof T>; pending: Partial<T>[]; tail: Promise<unknown> }>();
  private revisions = new Map<string, number>();

  revision(id: string) { return this.revisions.get(id) ?? 0; }
  isPending(id: string) { return this.entries.has(id); }
  snapshot() { return new Map(this.revisions); }

  enqueue(id: string, base: T, patch: Partial<T>, publish: (patch: Partial<T>) => void, save: () => Promise<boolean>) {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { base, keys: new Set(), pending: [], tail: Promise.resolve() };
      this.entries.set(id, entry);
    }
    const current = entry;
    for (const key of Object.keys(patch) as (keyof T)[]) current.keys.add(key);
    current.pending.push(patch);
    this.revisions.set(id, this.revision(id) + 1);
    const render = () => {
      const projected = Object.assign({}, current.base, ...current.pending) as T;
      const changes: Partial<T> = {};
      for (const key of current.keys) changes[key] = projected[key];
      publish(changes);
    };
    render();
    const result = current.tail.then(async () => {
      let ok = false;
      try { ok = await save(); } catch { /* Caller receives a failed result. */ }
      if (ok) current.base = { ...current.base, ...patch };
      current.pending.shift();
      this.revisions.set(id, this.revision(id) + 1);
      render();
      if (!current.pending.length) this.entries.delete(id);
      return ok;
    });
    current.tail = result;
    return result;
  }
}
