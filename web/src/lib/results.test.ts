import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aiSteps, deriveStatus, getRun, isRunId, listRuns, parseLog, resolveEvidence } from './results';

const result = (over: Record<string, unknown> = {}) => ({
  runId: 'RUN0000001',
  flow: 'Checkout with card',
  verdict: 'bug',
  reason: 'expectation-failed: x',
  steps: 4,
  durationSeconds: 12.5,
  cost: { calls: 4, inputTokens: 4000, outputTokens: 300, usd: 0.03 },
  stepResults: [{ index: 0, text: 'Open', status: 'passed' }],
  findings: [{ kind: 'expectation-failed', message: 'size L', stepIndex: 1, url: 'http://x/cart' }],
  finalUrl: 'http://x/cart',
  promptVersion: 'agent-v2',
  model: 'm',
  startedAt: '2026-10-22T02:14:00.000Z',
  url: 'http://x',
  flowSource: 'flows/c.yaml',
  artifacts: { video: 'video/a.webm', screenshots: ['screenshots/001.png'] },
  ...over,
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'nq-results-'));
  const make = async (id: string, files: Record<string, string>) => {
    await mkdir(join(root, id), { recursive: true });
    for (const [name, body] of Object.entries(files)) await writeFile(join(root, id, name), body);
  };
  return { root, make };
}

describe('getRun / listRuns', () => {
  it('reads a finished run and tells replays from AI runs', async () => {
    const { root, make } = await fixture();
    await make('RUN0000001', { 'result.json': JSON.stringify(result()) });
    await make('RUN0000002', { 'result.json': JSON.stringify(result({ runId: 'RUN0000002', verdict: 'pass', promptVersion: 'replay-v1', startedAt: '2026-10-23T02:00:00.000Z' })) });
    const runs = await listRuns(root);
    expect(runs.map((r) => r.id)).toEqual(['RUN0000002', 'RUN0000001']); // newest first
    expect(runs[0]).toMatchObject({ status: 'finished', mode: 'replay' });
    expect(runs[1]?.result?.verdict).toBe('bug');
  });

  it('shows a run that has only a job file as crashed when its process is gone', async () => {
    const { root, make } = await fixture();
    await make('RUN0000003', { 'job.json': JSON.stringify({ flowName: 'Coupon', flowFile: 'flows/zoo/coupon.yaml', mode: 'run', startedAt: '2026-10-22T05:00:00.000Z', pid: 2_000_000_000 }) });
    const run = await getRun('RUN0000003', root);
    expect(run).toMatchObject({ status: 'crashed', flow: 'Coupon' });
  });

  it('shows a run as running while its process is alive', async () => {
    const { root, make } = await fixture();
    await make('RUN0000004', { 'job.json': JSON.stringify({ flowName: 'Coupon', flowFile: 'f.yaml', mode: 'run', startedAt: new Date().toISOString(), pid: process.pid }) });
    expect((await getRun('RUN0000004', root))?.status).toBe('running');
  });

  it('ignores junk folders and corrupt result files', async () => {
    const { root, make } = await fixture();
    await make('RUN0000005', { 'result.json': '{not json' });
    await make('not an id!', { 'result.json': '{}' });
    expect(await listRuns(root)).toEqual([]);
  });
});

describe('deriveStatus', () => {
  it('finished wins; hand-started runs are judged by log age', () => {
    expect(deriveStatus({ hasResult: true })).toBe('finished');
    expect(deriveStatus({ hasResult: false, logAgeMs: 1000 })).toBe('running');
    expect(deriveStatus({ hasResult: false, logAgeMs: 60 * 60_000 })).toBe('crashed');
  });
});

describe('evidence paths', () => {
  it('serves files inside the run folder only', () => {
    const root = '/data/results';
    expect(resolveEvidence('RUN0000001', 'video/a.webm', root)).toBe('/data/results/RUN0000001/video/a.webm');
    expect(resolveEvidence('RUN0000001', '../RUN0000002/result.json', root)).toBeUndefined();
    expect(resolveEvidence('RUN0000001', '../../etc/passwd.json', root)).toBeUndefined();
    expect(resolveEvidence('../x', 'a.png', root)).toBeUndefined();
    expect(resolveEvidence('RUN0000001', 'secret.env', root)).toBeUndefined();
    expect(isRunId('01M5H8FMS9SYKZNZKD3S27GJXK')).toBe(true);
    expect(isRunId('../..')).toBe(false);
  });
});

describe('log parsing', () => {
  const text = [
    JSON.stringify({ event: 'ai_call', step: 1, stepIndex: 0, tool: 'click', reasoning: 'Open it', inputTokens: 100, outputTokens: 10, costUsd: 0.01 }),
    'garbage',
    JSON.stringify({ event: 'run_finished', verdict: 'pass' }),
    '{"event":"ai_ca',
  ].join('\n');
  it('skips bad lines and extracts AI steps', () => {
    const log = parseLog(text);
    expect(log.map((e) => e.event)).toEqual(['ai_call', 'run_finished']);
    expect(aiSteps(log)).toEqual([{ step: 1, stepIndex: 0, tool: 'click', reasoning: 'Open it', inputTokens: 100, outputTokens: 10, costUsd: 0.01 }]);
  });
});
