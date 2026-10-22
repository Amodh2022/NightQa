import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { columnOf, getBug, latestPerBug, listBugs, mergedFixRate, type BugRecord } from './bugs';

const rec = (over: Partial<BugRecord> = {}): BugRecord => ({
  version: 1,
  id: 'bug-0123456789ab',
  runId: '01HRUN0000000000000000000A',
  flow: 'Checkout',
  title: 'T',
  severity: 'high',
  status: 'reported',
  statusNote: '',
  reproduced: 3,
  attempts: 3,
  recipe: [],
  expected: '',
  actual: '',
  evidence: [],
  createdAt: '2026-10-22T10:00:00Z',
  updatedAt: '2026-10-22T10:00:00Z',
  ...over,
});

async function put(root: string, r: BugRecord) {
  const dir = join(root, r.runId, 'bugs', r.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'bug.json'), JSON.stringify(r));
}

describe('bug records', () => {
  it('lists real records, skips broken ones, and rejects path tricks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nq-bugs-'));
    await put(root, rec());
    await put(root, rec({ id: 'bug-aaaaaaaaaaaa', severity: 'critical', runId: '01HRUN0000000000000000000A' }));
    await mkdir(join(root, '01HRUN0000000000000000000B', 'bugs', 'bug-bbbbbbbbbbbb'), { recursive: true });
    await writeFile(join(root, '01HRUN0000000000000000000B', 'bugs', 'bug-bbbbbbbbbbbb', 'bug.json'), '{oops');
    const all = await listBugs(root);
    expect(all.map((b) => b.id)).toEqual(['bug-aaaaaaaaaaaa', 'bug-0123456789ab']);
    expect((await getBug('01HRUN0000000000000000000A', 'bug-0123456789ab', root))?.title).toBe('T');
    expect(await getBug('../x', 'bug-0123456789ab', root)).toBeUndefined();
    expect(await getBug('01HRUN0000000000000000000A', '../../etc', root)).toBeUndefined();
  });
  it('keeps the newest record per bug', () => {
    const a = rec({ updatedAt: '2026-10-22T10:00:00Z' });
    const b = rec({ runId: '01HRUN0000000000000000000B', updatedAt: '2026-10-23T10:00:00Z', status: 'ready' });
    expect(latestPerBug([a, b])).toEqual([b]);
  });
  it('puts bugs in board columns from the real state', () => {
    expect(columnOf(rec())).toBe('proven');
    expect(columnOf(rec({ pull: { number: 1, url: 'u', state: 'open' } }))).toBe('fix_pr');
    expect(columnOf(rec({ pull: { number: 1, url: 'u', state: 'merged' } }))).toBe('fixed');
    expect(columnOf(rec({ issue: { number: 1, url: 'u', state: 'closed', action: 'created' } }))).toBe('fixed');
    expect(columnOf(rec({ status: 'needs_look' }))).toBe('needs_look');
    expect(columnOf(rec({ status: 'discarded' }))).toBeUndefined();
  });
  it('computes the merged fix rate from closed pull requests only', () => {
    expect(mergedFixRate([rec()])).toBeUndefined();
    const merged = rec({ id: 'bug-111111111111', pull: { number: 1, url: 'u', state: 'merged' } });
    const closed = rec({ id: 'bug-222222222222', pull: { number: 2, url: 'u', state: 'closed' } });
    const open = rec({ id: 'bug-333333333333', pull: { number: 3, url: 'u', state: 'open' } });
    expect(mergedFixRate([merged, closed, open])).toBe(0.5);
  });
});
