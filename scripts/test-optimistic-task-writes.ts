import assert from 'node:assert/strict';
import { OptimisticTaskWrites } from '../lib/optimistic-task-writes';

async function main() {
  type Row = { status: string; priority: string; title: string };
  let row: Row = { status: 'open', priority: 'low', title: 'Keep me' };
  let server = { ...row };
  const writes = new OptimisticTaskWrites<Row>();
  const publish = (patch: Partial<Row>) => { row = { ...row, ...patch }; };
  const calls: string[] = [];
  let resolveFirst!: (ok: boolean) => void;
  const first = writes.enqueue('a', row, { status: 'closed' }, publish, () => {
    calls.push('status');
    return new Promise(resolve => { resolveFirst = resolve; });
  });
  const second = writes.enqueue('a', row, { priority: 'high' }, publish, async () => {
    calls.push('priority'); server.priority = 'high'; return true;
  });
  assert.deepEqual(row, { status: 'closed', priority: 'high', title: 'Keep me' });
  await Promise.resolve();
  assert.deepEqual(calls, ['status']);
  resolveFirst(false);
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.deepEqual(row, server, 'failed Stage must roll back even when another field was edited');
  assert.equal(writes.isPending('a'), false);

  const before = writes.snapshot();
  const third = writes.enqueue('a', row, { status: 'closed' }, publish, async () => { server.status = 'closed'; return true; });
  const fourth = writes.enqueue('a', row, { status: 'open' }, publish, async () => false);
  assert.equal(row.status, 'open', 'latest edit displays immediately');
  await Promise.all([third, fourth]);
  assert.equal(row.status, 'closed', 'failed reopen restores last successful state');
  assert.notEqual(writes.revision('a'), before.get('a'), 'stale list responses can be rejected');

  const fifth = writes.enqueue('a', row, { status: 'open' }, publish, async () => { throw new Error('offline'); });
  publish({ title: 'Unrelated external update' });
  assert.equal(await fifth, false);
  assert.equal(row.title, 'Unrelated external update');
  assert.equal(row.status, 'closed');

  let other = { ...row, status: 'open' };
  const results = await Promise.all([
    writes.enqueue('a', row, { priority: 'low' }, publish, async () => false),
    writes.enqueue('b', other, { status: 'closed' }, patch => { other = { ...other, ...patch }; }, async () => true),
  ]);
  assert.deepEqual(results, [false, true]);
  assert.equal(other.status, 'closed', 'partial Board failure must not roll back a successful move');
  assert.equal(row.priority, 'high');
  console.log('Optimistic Action writes: serialized persistence, rapid edits, per-field rollback, partial failure and stale-response checks passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
