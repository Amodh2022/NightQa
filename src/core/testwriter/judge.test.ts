import { describe, expect, it } from 'vitest';
import { parseSpecReport } from '../../io/run-spec.js';
import { bugMarker } from './bug-spec.js';
import { judgeFailingTest } from './judge.js';

describe('judgeFailingTest', () => {
  it('accepts only a failure at the bug check', () => {
    const msg = `Error: ${bugMarker('bug-1')}: title\n expected`;
    expect(judgeFailingTest({ status: 'failed', message: msg }, 'bug-1')).toEqual({ valid: true });
  });
  it('throws away a passing test', () => {
    expect(judgeFailingTest({ status: 'passed', message: '' }, 'bug-1').valid).toBe(false);
  });
  it('rejects a failure for another reason', () => {
    const r = judgeFailingTest({ status: 'failed', message: 'locator.click: not found' }, 'bug-1');
    expect(r.valid).toBe(false);
  });
  it('rejects a test that could not run, and another bug marker', () => {
    expect(judgeFailingTest({ status: 'error', message: 'boom' }, 'bug-1').valid).toBe(false);
    expect(judgeFailingTest({ status: 'failed', message: bugMarker('bug-2') }, 'bug-1').valid).toBe(
      false,
    );
  });
});

describe('parseSpecReport', () => {
  const report = (status: string, message?: string) =>
    JSON.stringify({
      suites: [
        {
          specs: [
            { tests: [{ results: [{ status, ...(message ? { error: { message } } : {}) }] }] },
          ],
        },
      ],
    });
  it('reads pass, fail and garbage', () => {
    expect(parseSpecReport(report('passed')).status).toBe('passed');
    expect(parseSpecReport(report('failed', 'bad')).message).toBe('bad');
    expect(parseSpecReport(report('timedOut')).status).toBe('failed');
    expect(parseSpecReport('not json').status).toBe('error');
    expect(parseSpecReport('{"suites":[]}').status).toBe('error');
  });
});
