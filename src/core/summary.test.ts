import { describe, expect, it } from 'vitest';
import type { RunResult } from './agent/loop.js';
import { exitCodeFor, formatSummary } from './summary.js';

const base: RunResult = {
  runId: 'R1',
  flow: 'Checkout',
  verdict: 'bug',
  reason: 'expectation-failed: x',
  steps: 4,
  durationSeconds: 12.5,
  cost: { calls: 4, inputTokens: 4000, outputTokens: 300, usd: 0.01234 },
  stepResults: [],
  findings: [{ kind: 'expectation-failed', message: 'size L', stepIndex: 1, url: 'http://x/cart' }],
  actions: [],
  finalUrl: 'http://x/cart',
  promptVersion: 'agent-v1',
  model: 'm',
};

describe('summary', () => {
  it('prints verdict, findings, tokens and cost per run', () => {
    const s = formatSummary(base, 'results/R1');
    expect(s).toContain('BUG  Checkout');
    expect(s).toContain('[expectation-failed] size L (step 2');
    expect(s).toContain('cost: $0.0123');
    expect(s).toContain('4000 in / 300 out');
  });
  it('maps verdicts to exit codes', () => {
    expect(exitCodeFor('pass')).toBe(0);
    expect(exitCodeFor('bug')).toBe(1);
    expect(exitCodeFor('agent_stuck')).toBe(3);
    expect(exitCodeFor('needs_setup')).toBe(3);
  });
});
