import { describe, expect, it } from 'vitest';
import { computeSetup, pickStep, type SetupInput } from './setup-state';

describe('pickStep', () => {
  it('prefers a valid ?step, else the current one', () => {
    const s = computeSetup({ urlStatus: 'empty', urlSaved: false, accounts: [], repo: '', hasGithubToken: false, githubCheck: undefined, flowCount: 0, finishedRuns: 0, notifyConnected: 0 });
    expect(pickStep(s, '3')?.id).toBe('github');
    expect(pickStep(s, '99')?.id).toBe('url');
    expect(pickStep(s, 'x')?.id).toBe('url');
    expect(pickStep(s, undefined)?.id).toBe('url');
  });
});

const empty: SetupInput = { urlStatus: 'empty', urlSaved: false, accounts: [], repo: '', hasGithubToken: false, githubCheck: undefined, flowCount: 0, finishedRuns: 0, notifyConnected: 0 };

describe('computeSetup', () => {
  it('starts at step 1 with everything left', () => {
    const s = computeSetup(empty);
    expect(s.doneCount).toBe(0);
    expect(s.current?.id).toBe('url');
    expect(s.minutesLeft).toBe(28);
  });
  it('derives each step from real state', () => {
    const s = computeSetup({
      ...empty,
      urlStatus: 'ok',
      urlSaved: true,
      accounts: [{ name: 'b', hasUsername: true, hasPassword: true, usedBy: [] }],
      repo: 'a/b',
      hasGithubToken: true,
      githubCheck: { ok: true, repo: 'a/b', at: 'x', message: 'm' },
      flowCount: 2,
    });
    expect(s.steps.map((x) => x.done)).toEqual([true, true, true, true, false, false]);
    expect(s.current?.id).toBe('run');
    expect(s.minutesLeft).toBe(8);
  });
  it('does not count a blocked url, a half account, or a test of another repo', () => {
    const s = computeSetup({
      ...empty,
      urlStatus: 'blocked',
      urlSaved: true,
      accounts: [{ name: 'b', hasUsername: true, hasPassword: false, usedBy: [] }],
      repo: 'a/b',
      hasGithubToken: true,
      githubCheck: { ok: true, repo: 'x/y', at: 'x', message: 'm' },
    });
    expect(s.doneCount).toBe(0);
  });
  it('is complete when all done', () => {
    const s = computeSetup({ ...empty, urlStatus: 'ok', urlSaved: true, accounts: [{ name: 'b', hasUsername: true, hasPassword: true, usedBy: [] }], repo: 'a/b', hasGithubToken: true, githubCheck: { ok: true, repo: 'a/b', at: '', message: '' }, flowCount: 1, finishedRuns: 1, notifyConnected: 1 });
    expect(s.current).toBeUndefined();
    expect(s.minutesLeft).toBe(0);
  });
});
