import type { RunResult } from './agent/loop.js';

/** Human-readable end-of-run summary, including the cost of the run. */
export function formatSummary(r: RunResult, dir: string): string {
  const icon = {
    pass: 'PASS',
    bug: 'BUG',
    app_changed: 'APP CHANGED',
    needs_setup: 'NEEDS SETUP',
    agent_stuck: 'AGENT STUCK',
  }[r.verdict];
  const lines = [
    `${icon}  ${r.flow}`,
    `  ${r.reason}`,
    ...r.findings.map(
      (f) => `  - [${f.kind}] ${f.message} (step ${String(f.stepIndex + 1)}, ${f.url})`,
    ),
    `  steps: ${String(r.steps)}   time: ${String(r.durationSeconds)}s   ai calls: ${String(r.cost.calls)}`,
    `  tokens: ${String(r.cost.inputTokens)} in / ${String(r.cost.outputTokens)} out   cost: $${r.cost.usd.toFixed(4)}`,
    `  run: ${r.runId}`,
    `  evidence: ${dir}`,
  ];
  return lines.join('\n');
}

/** Exit codes: 0 pass, 1 bug found, 3 needs_setup / agent_stuck / app_changed. (2 is for usage and config errors.) */
export function exitCodeFor(verdict: RunResult['verdict']): number {
  if (verdict === 'pass') return 0;
  if (verdict === 'bug') return 1;
  return 3;
}
