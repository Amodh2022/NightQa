import { describe, expect, it } from 'vitest';
import { decideVerdict, type Finding } from './verdict.js';

const f: Finding = { kind: 'http-5xx', message: '500 from /api', stepIndex: 1, url: 'http://x/' };

describe('decideVerdict', () => {
  it('passes only when all steps passed and nothing was found', () => {
    expect(decideVerdict({ findings: [], allStepsPassed: true }).verdict).toBe('pass');
  });
  it('fails closed when steps did not all pass', () => {
    expect(decideVerdict({ findings: [], allStepsPassed: false }).verdict).toBe('agent_stuck');
  });
  it('treats findings as a bug even if the agent also got stuck', () => {
    const r = decideVerdict({ findings: [f, f], stuckReason: 'budget', allStepsPassed: false });
    expect(r.verdict).toBe('bug');
    expect(r.reason).toContain('+1 more');
  });
  it('treats a finding on an otherwise passing run as a bug', () => {
    expect(decideVerdict({ findings: [f], allStepsPassed: true }).verdict).toBe('bug');
  });
  it('puts setup problems first and never calls them bugs', () => {
    expect(
      decideVerdict({ setupProblem: 'login failed', findings: [f], allStepsPassed: false }).verdict,
    ).toBe('needs_setup');
  });
  it('reports a stuck agent with its reason', () => {
    expect(
      decideVerdict({ findings: [], stuckReason: 'cannot find Pay', allStepsPassed: false }),
    ).toEqual({
      verdict: 'agent_stuck',
      reason: 'cannot find Pay',
    });
  });
});
