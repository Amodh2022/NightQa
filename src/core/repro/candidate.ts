import type { RunResult } from '../agent/loop.js';
import type { RunProfile } from '../profiles.js';
import type { Flow } from '../flow/schema.js';
import { bugId } from './fingerprint.js';
import type { BugCandidate } from './types.js';

/** Turns each finding of a buggy run into a candidate to reproduce. Duplicates inside one run collapse. */
export function buildCandidates(
  result: RunResult,
  flow: Flow,
  profile?: RunProfile,
): BugCandidate[] {
  if (result.verdict !== 'bug') return [];
  const out = new Map<string, BugCandidate>();
  for (const finding of result.findings) {
    const expected = flow.steps[finding.stepIndex]?.expect;
    const id = bugId(finding, flow.flow, expected);
    if (out.has(id)) continue;
    out.set(id, {
      id,
      finding,
      runId: result.runId,
      flow: flow.flow,
      start: flow.start,
      ...(flow.login !== undefined ? { login: flow.login } : {}),
      tags: flow.tags,
      ...(profile ? { profile } : {}),
      steps: flow.steps.map((s) => s.text),
      ...(expected !== undefined ? { expected } : {}),
      actions: result.actions,
      ...(finding.kind === 'expectation-failed' && result.failure ? { proof: result.failure } : {}),
    });
  }
  return [...out.values()];
}
