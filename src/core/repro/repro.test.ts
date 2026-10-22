import { describe, expect, it } from 'vitest';
import type { RecordedAction } from '../agent/loop.js';
import { buildCandidates } from './candidate.js';
import { bugId, findingKey, normalizeMessage } from './fingerprint.js';
import { classify, reproduce } from './reproduce.js';
import { atLeast, rateSeverity } from './severity.js';
import { shortenRecipe } from './shorten.js';
import type { BugCandidate } from './types.js';
import type { RunResult } from '../agent/loop.js';
import type { Flow } from '../flow/schema.js';

const click = (name: string, stepIndex = 0): RecordedAction => ({
  stepIndex,
  action: { kind: 'click', target: { by: 'role', role: 'button', name, nth: 0 } },
});

function candidate(over: Partial<BugCandidate> = {}): BugCandidate {
  return {
    id: 'bug-1',
    finding: {
      kind: 'http-5xx',
      message: 'GET /api/x returned 500',
      stepIndex: 0,
      url: 'http://a/x',
    },
    runId: 'R1',
    flow: 'Demo',
    start: '/',
    tags: [],
    steps: ['Open the page'],
    actions: [click('a'), click('b'), click('c'), click('d')],
    ...over,
  };
}

describe('shortenRecipe', () => {
  it('keeps only the items the bug needs', async () => {
    const { items } = await shortenRecipe(
      [1, 2, 3, 4, 5, 6],
      (c) => Promise.resolve(c.includes(2) && c.includes(5)),
      50,
    );
    expect(items).toEqual([2, 5]);
  });
  it('can reduce to nothing when the bug needs no action', async () => {
    const { items } = await shortenRecipe([1, 2, 3], () => Promise.resolve(true), 50);
    expect(items).toEqual([]);
  });
  it('never exceeds the trial budget and never returns a non-reproducing list', async () => {
    let calls = 0;
    const { items, trials } = await shortenRecipe(
      [1, 2, 3, 4, 5, 6, 7, 8],
      (c) => {
        calls++;
        return Promise.resolve(c.length >= 4);
      },
      3,
    );
    expect(trials).toBe(3);
    expect(calls).toBe(3);
    expect(items.length).toBeGreaterThanOrEqual(4);
  });
});

describe('classify', () => {
  it('needs every replay for confirmed', () => {
    expect(classify([true, true, true])).toBe('confirmed');
    expect(classify([true, false, true])).toBe('flaky');
    expect(classify([false, false, false])).toBe('not_reproduced');
    expect(classify([])).toBe('not_reproduced');
  });
});

describe('reproduce', () => {
  it('confirms 3/3 and shortens the recipe, re-verifying the short one', async () => {
    let calls = 0;
    const r = await reproduce(candidate(), {
      attempt: (actions) => {
        calls++;
        const names = actions.map((a) => (a.action.kind === 'click' ? a.action.target.name : ''));
        return Promise.resolve({ reproduced: names.includes('c'), note: 'x' });
      },
    });
    expect(r.status).toBe('confirmed');
    expect(r.recipe).toHaveLength(1);
    expect(r.originalActionCount).toBe(4);
    expect(r.reproducedCount).toBe(3);
    expect(calls).toBeGreaterThan(6);
  });
  it('reports flaky bugs as flaky and does not shorten them', async () => {
    let i = 0;
    const r = await reproduce(candidate(), {
      attempt: () => Promise.resolve({ reproduced: i++ === 1, note: '' }),
    });
    expect(r.status).toBe('flaky');
    expect(r.recipe).toHaveLength(4);
  });
  it('discards a bug that never reproduces', async () => {
    const r = await reproduce(candidate(), {
      attempt: () => Promise.resolve({ reproduced: false, note: '' }),
    });
    expect(r.status).toBe('not_reproduced');
  });
  it('keeps the full recipe when the shorter one is not stable', async () => {
    let shortCalls = 0;
    const r = await reproduce(candidate(), {
      attempt: (actions) => {
        if (actions.length === 4) return Promise.resolve({ reproduced: true, note: '' });
        shortCalls++;
        return Promise.resolve({ reproduced: shortCalls === 1, note: '' });
      },
    });
    expect(r.recipe).toHaveLength(4);
    expect(r.status).toBe('confirmed');
  });
  it('only replays actions before a failed check', async () => {
    const r = await reproduce(
      candidate({
        finding: { kind: 'expectation-failed', message: 'm', stepIndex: 0, url: 'http://a/' },
        proof: {
          stepIndex: 0,
          afterActions: 2,
          statement: 's',
          visibleText: ['x'],
          missingText: [],
          disabledControls: [],
        },
      }),
      { attempt: () => Promise.resolve({ reproduced: true, note: '' }) },
    );
    expect(r.originalActionCount).toBe(2);
  });
});

describe('severity', () => {
  const kind = (
    k: BugCandidate['finding']['kind'],
    message = 'm',
    extra: Partial<BugCandidate> = {},
  ) =>
    rateSeverity(
      candidate({ finding: { kind: k, message, stepIndex: 0, url: 'http://a/' }, ...extra }),
    );
  it('rates by the PRD table', () => {
    expect(kind('console-error')).toBe('low');
    expect(kind('js-error')).toBe('medium');
    expect(kind('blank-page')).toBe('medium');
    expect(kind('http-5xx')).toBe('high');
    expect(kind('expectation-failed', 'step 1 expected total but it shows 49')).toBe('high');
  });
  it('is critical when payment or login cannot be completed', () => {
    expect(
      kind(
        'expectation-failed',
        'step 3 expected the order is paid but the Pay now button stays disabled',
      ),
    ).toBe('critical');
    expect(kind('expectation-failed', 'cannot sign in: the login form does nothing')).toBe(
      'critical',
    );
  });
  it('compares levels', () => {
    expect(atLeast('critical', 'high')).toBe(true);
    expect(atLeast('medium', 'high')).toBe(false);
  });
});

describe('fingerprint', () => {
  it('ignores digits, query strings and ids so the same bug keeps its id', () => {
    const a = {
      kind: 'http-5xx' as const,
      message: 'GET http://h/api/search?q=a%20b returned 500 in 31ms',
      stepIndex: 1,
      url: 'http://h/search?q=1',
    };
    const b = {
      ...a,
      message: 'GET http://h/api/search?q=zzz returned 500 in 87ms',
      url: 'http://h/search?q=2',
    };
    expect(findingKey(a)).toBe(findingKey(b));
    expect(bugId(a, 'f', undefined)).toBe(bugId(b, 'f', undefined));
  });
  it('uses the expectation, not the evidence wording, for failed expectations', () => {
    const f = (message: string) => ({
      kind: 'expectation-failed' as const,
      message,
      stepIndex: 1,
      url: 'http://h/cart',
    });
    expect(bugId(f('step 2 expected "total $98" but total is 49'), 'F', 'total $98')).toBe(
      bugId(f('step 2 expected "total $98" but the page says 49.00'), 'F', 'total $98'),
    );
    expect(bugId(f('x'), 'F', 'total $98')).not.toBe(bugId(f('x'), 'F', 'other'));
  });
  it('normalizes', () => {
    expect(normalizeMessage('Error 500 at /a?x=1 id abcdef1234')).toBe('error # at /a id #');
  });
});

describe('buildCandidates', () => {
  const flow: Flow = {
    flow: 'Demo',
    start: '/',
    tags: [],
    steps: [{ text: 'open', expect: 'it works' }],
    variations: [],
  };
  const result = (over: Partial<RunResult>): RunResult => ({
    runId: 'R',
    flow: 'Demo',
    verdict: 'bug',
    reason: '',
    steps: 1,
    durationSeconds: 1,
    cost: { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 },
    stepResults: [],
    findings: [],
    actions: [click('a')],
    assertions: [],
    finalUrl: '',
    promptVersion: 'x',
    model: '',
    ...over,
  });
  it('makes one candidate per distinct finding and attaches the proof', () => {
    const f = { kind: 'expectation-failed' as const, message: 'm', stepIndex: 0, url: 'http://a/' };
    const proof = {
      stepIndex: 0,
      afterActions: 1,
      statement: 's',
      visibleText: ['x'],
      missingText: [],
      disabledControls: [],
    };
    const c = buildCandidates(result({ findings: [f, f], failure: proof }), flow);
    expect(c).toHaveLength(1);
    expect(c[0]?.proof).toEqual(proof);
    expect(c[0]?.expected).toBe('it works');
  });
  it('makes nothing for a run that did not find a bug', () => {
    expect(buildCandidates(result({ verdict: 'pass' }), flow)).toEqual([]);
  });
});
