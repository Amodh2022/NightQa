import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteExpiredEvidence, expiredRuns, getRetention, saveRetentionDays } from './retention';
import type { RunView } from './results';

const run = (id: string, daysAgo: number, status: RunView['status'] = 'finished'): RunView => ({
  id,
  status,
  mode: 'ai',
  flow: 'f',
  startedAt: new Date(Date.UTC(2026, 9, 22) - daysAgo * 86_400_000),
});
const NOW = new Date(Date.UTC(2026, 9, 22));

describe('expiredRuns', () => {
  it('keeps recent and running runs', () => {
    const r = expiredRuns([run('RUN0000001', 40), run('RUN0000002', 5), run('RUN0000003', 90, 'running')], 30, NOW);
    expect(r.map((x) => x.id)).toEqual(['RUN0000001']);
  });
});

describe('retention store', () => {
  it('defaults to 30 and persists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nq-ret-'));
    expect((await getRetention(dir)).days).toBe(30);
    await saveRetentionDays(7, dir);
    expect((await getRetention(dir)).days).toBe(7);
    await expect(saveRetentionDays(0, dir)).rejects.toThrow();
  });
});

describe('deleteExpiredEvidence', () => {
  it('removes only old finished run folders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nq-res-'));
    const make = async (id: string, startedAt: string) => {
      await mkdir(join(root, id), { recursive: true });
      await writeFile(
        join(root, id, 'result.json'),
        JSON.stringify({
          runId: id, flow: 'F', verdict: 'pass', reason: 'ok', steps: 1, durationSeconds: 1,
          cost: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 }, stepResults: [], findings: [], finalUrl: 'http://x',
          promptVersion: 'p', model: 'm', startedAt, url: 'http://x', flowSource: 'f.yaml', artifacts: { screenshots: [] },
        }),
      );
    };
    await make('OLDRUN0001', '2026-01-01T00:00:00.000Z');
    await make('NEWRUN0001', '2026-10-21T00:00:00.000Z');
    const removed = await deleteExpiredEvidence(30, NOW, root);
    expect(removed).toEqual(['OLDRUN0001']);
    expect(existsSync(join(root, 'OLDRUN0001'))).toBe(false);
    expect(existsSync(join(root, 'NEWRUN0001'))).toBe(true);
  });
});
