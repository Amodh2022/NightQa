import { describe, expect, it } from 'vitest';
import type { RunResult } from './agent/loop.js';
import type { Flow } from './flow/schema.js';
import { buildRecording, parseRecording, slugify } from './recording.js';
import { accountEnvVar, generateSpec } from './specgen.js';

const flow: Flow = {
  flow: 'Checkout with card',
  start: '/products',
  login: 'test-buyer',
  tags: [],
  steps: [{ text: 'Sign in' }, { text: 'Open cart', expect: 'cart shows 1 item' }],
  variations: [],
};

const result: RunResult = {
  runId: 'R1',
  flow: flow.flow,
  verdict: 'pass',
  reason: 'ok',
  steps: 5,
  durationSeconds: 1,
  cost: { calls: 5, inputTokens: 1, outputTokens: 1, usd: 0.01 },
  stepResults: [],
  findings: [],
  actions: [
    {
      stepIndex: 0,
      action: {
        kind: 'type',
        target: { by: 'label', name: 'Password', nth: 0 },
        text: '{{account.password}}',
      },
    },
    {
      stepIndex: 0,
      action: { kind: 'click', target: { by: 'role', role: 'button', name: 'Sign in', nth: 0 } },
    },
    {
      stepIndex: 1,
      action: {
        kind: 'type',
        target: { by: 'role', role: 'combobox', name: 'Size', nth: 0 },
        text: 'M',
      },
    },
    {
      stepIndex: 1,
      action: { kind: 'click', target: { by: 'role', role: 'link', name: 'Cart', nth: 1 } },
    },
    { stepIndex: 1, action: { kind: 'wait', condition: { kind: 'ms', ms: 1000 } } },
  ],
  assertions: [
    {
      stepIndex: 0,
      afterActions: 2,
      statement: 'signed in',
      visibleText: ['Signed in as test-buyer'],
    },
    {
      stepIndex: 1,
      afterActions: 5,
      statement: 'cart',
      visibleText: ['Cart shows 1 item', 'Total: $49.00'],
    },
  ],
  finalUrl: 'http://x/cart',
  promptVersion: 'agent-v2',
  model: 'm',
};

describe('buildRecording', () => {
  const rec = buildRecording(result, flow, {
    flowSource: 'flows/c.yaml',
    createdAt: '2026-10-22T00:00:00Z',
  });

  it('interleaves actions and assertions in order', () => {
    expect(rec.events.map((e) => (e.type === 'assert' ? 'assert' : e.action.kind))).toEqual([
      'type',
      'click',
      'assert',
      'type',
      'click',
      'wait',
      'assert',
    ]);
  });
  it('round-trips through JSON validation', () => {
    expect(parseRecording(JSON.stringify(rec)).flow).toBe('Checkout with card');
    expect(() => parseRecording(JSON.stringify({ ...rec, version: 2 }))).toThrow();
  });
  it('refuses to record a run that did not pass', () => {
    expect(() =>
      buildRecording({ ...result, verdict: 'bug' }, flow, { flowSource: 'x', createdAt: 'x' }),
    ).toThrow('passing');
  });
  it('slugifies flow names', () => {
    expect(slugify('Checkout with card!')).toBe('checkout-with-card');
    expect(slugify('???')).toBe('flow');
  });
});

describe('generateSpec', () => {
  const spec = generateSpec(buildRecording(result, flow, { flowSource: 'x', createdAt: 'x' }));

  it('is plain Playwright with stable locators and web-first assertions', () => {
    expect(spec).toContain("import { test, expect } from '@playwright/test';");
    expect(spec).toContain('await page.goto("/products");');
    expect(spec).toContain('page.getByRole("button", { name: "Sign in", exact: true }).click()');
    expect(spec).toContain(
      'page.getByRole("combobox", { name: "Size", exact: true }).selectOption({ label: "M" })',
    );
    expect(spec).toContain('page.getByRole("link", { name: "Cart", exact: true }).nth(1).click()');
    expect(spec).toContain('await expect(page.getByText("Total: $49.00").first()).toBeVisible();');
    expect(spec).toContain('// Step 2: Open cart');
  });
  it('reads credentials from the environment, never the file', () => {
    expect(spec).toContain('process.env.NIGHTQA_ACCOUNT_TEST_BUYER_PASSWORD');
    expect(spec).not.toContain('{{account');
    expect(accountEnvVar('test-buyer', 'USERNAME')).toBe('NIGHTQA_ACCOUNT_TEST_BUYER_USERNAME');
  });
  it('never writes sleeps or fixed waits', () => {
    expect(spec).not.toMatch(/waitForTimeout|setTimeout|sleep/);
  });
});
