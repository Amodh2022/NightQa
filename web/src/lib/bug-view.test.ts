import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBugSpec, setCloseReason } from './bug-files';
import { buildStory, canAskForFix, closeReasonSchema, filterBugs, fixComment, groupByColumn, highlight, parseFilter, safeHref, splitEvidence, stepWindow } from './bug-view';
import { bugRecordSchema, type BugRecord } from './bugs';

const base: BugRecord = bugRecordSchema.parse({
  version: 1,
  id: 'bug-0123456789ab',
  runId: 'run-abcdef',
  flow: 'Checkout',
  title: 'Expired coupon\n@everyone is accepted',
  severity: 'high',
  status: 'ready',
  statusNote: '',
  reproduced: 3,
  attempts: 3,
  recipe: ['a', 'b'],
  expected: 'error',
  actual: 'discount',
  evidence: ['x/shot.png', 'video.webm', 'trace.zip', 'notes.txt'],
  test: { file: 'bugs/bug-0123456789ab/t.spec.ts', repoPath: 'tests/nightqa/t.spec.ts', proven: true },
  issue: { number: 142, url: 'https://github.com/o/r/issues/142', state: 'open', action: 'created' },
  createdAt: '2026-10-22T02:14:00.000Z',
  updatedAt: '2026-10-22T02:30:00.000Z',
});

describe('bug view', () => {
  it('offers a fix only when an issue is open and no fix was requested', () => {
    expect(canAskForFix(base)).toBe(true);
    expect(canAskForFix({ ...base, fix: { status: 'skipped', note: 'Low severity' } })).toBe(true);
    expect(canAskForFix({ ...base, fix: { status: 'requested' } })).toBe(false);
    expect(canAskForFix({ ...base, pull: { number: 1, url: 'https://x.test', state: 'open' } })).toBe(false);
    expect(canAskForFix(bugRecordSchema.parse({ ...base, issue: undefined }))).toBe(false);
  });

  it('builds a one-line-title @claude comment', () => {
    const text = fixComment(base);
    expect(text.startsWith('@claude please fix')).toBe(true);
    expect(text.split('\n')).toHaveLength(2);
    expect(text).toContain('tests/nightqa/t.spec.ts');
  });

  it('sorts evidence by type', () => {
    expect(splitEvidence(base.evidence)).toEqual({ images: ['x/shot.png'], videos: ['video.webm'], traces: ['trace.zip'] });
  });

  it('groups by board column and filters', () => {
    const fixed = { ...base, id: 'bug-aaaaaaaaaaaa', pull: { number: 2, url: 'https://x.test', state: 'merged' as const } };
    const g = groupByColumn([base, fixed]);
    expect(g.proven).toHaveLength(1);
    expect(g.fixed).toHaveLength(1);
    expect(filterBugs([base, fixed], 'fixed')).toEqual([fixed]);
    expect(filterBugs([base, fixed], 'all')).toHaveLength(2);
    expect(parseFilter('nope')).toBe('all');
    expect(parseFilter('fix_pr')).toBe('fix_pr');
  });

  it('only links http(s)', () => {
    expect(safeHref('https://github.com/a')).toBe('https://github.com/a');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('nope')).toBeUndefined();
  });

  it('tells the story from the record only', () => {
    const s = buildStory(base, () => 't');
    expect(s.map((i) => i.label)).toEqual(['Found by Checkout', 'Reproduced 3 of 3', 'Recipe of 2 steps', 'Failing test written and run', 'Issue #142 opened']);
  });

  it('validates close reasons', () => {
    expect(closeReasonSchema.safeParse('wont_fix').success).toBe(true);
    expect(closeReasonSchema.safeParse('delete_everything').success).toBe(false);
  });

  it('windows steps around the first failure', () => {
    const steps = ['passed', 'passed', 'passed', 'failed', 'pending', 'pending'].map((status) => ({ status }));
    expect(stepWindow(steps).map((s) => s.status)).toEqual(['passed', 'passed', 'failed', 'pending']);
  });

  it('highlights without losing text', () => {
    const line = "  await page.goto('/x'); // go";
    expect(highlight(line).map((t) => t.t).join('')).toBe(line);
  });
});

describe('bug files', () => {
  it('records a close reason and keeps unknown fields', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nq-bug-'));
    const dir = join(root, 'run-abcdef', 'bugs', base.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'bug.json'), JSON.stringify({ ...base, futureField: 7 }));
    const res = await setCloseReason('run-abcdef', base.id, 'wrong_fix', root, () => new Date('2026-10-23T00:00:00.000Z'));
    expect(res.ok).toBe(true);
    const saved = JSON.parse(await readFile(join(dir, 'bug.json'), 'utf8')) as Record<string, unknown>;
    expect(saved.closeReason).toBe('wrong_fix');
    expect(saved.futureField).toBe(7);
    expect(saved.updatedAt).toBe('2026-10-23T00:00:00.000Z');
  });

  it('refuses unknown or malformed ids', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nq-bug-'));
    expect((await setCloseReason('run-abcdef', 'bug-0123456789ab', 'wont_fix', root)).ok).toBe(false);
    expect((await setCloseReason('../x', base.id, 'wont_fix', root)).ok).toBe(false);
    expect((await setCloseReason('run-abcdef', '../../x', 'wont_fix', root)).ok).toBe(false);
  });

  it('reads the spec only inside the run folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nq-bug-'));
    const dir = join(root, 'run-abcdef', 'bugs', base.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 't.spec.ts'), 'test("x")');
    expect(await readBugSpec(base, root)).toBe('test("x")');
    if (!base.test) throw new Error('fixture');
    expect(await readBugSpec({ ...base, test: { ...base.test, file: '../../outside.ts' } }, root)).toBeUndefined();
    expect(await readBugSpec({ ...base, test: { ...base.test, file: 'bugs/x/secret.json' } }, root)).toBeUndefined();
  });
});
