import { describe, expect, it } from 'vitest';
import { isVagueExpectation } from './flow-rules';
import { draftToYaml, yamlToDraft, emptyDraft } from './flow-yaml';
import { normalizeShorthand, validateFlowSource } from './flow-validate';

// These mirror src/core/flow/parse.test.ts in the engine: same mistakes, same messages.
const GOOD = `flow: Checkout with card
start: /products
login: test-buyer
tags: [payments, critical]
steps:
  - Add "Blue T-shirt, size M" to the cart
  - step: Open the cart
    expect: cart shows 1 item, total $49.00
  - Pay with the test card
    expect: confirmation page shows an order number
variations:
  - try an expired coupon
`;

function issues(src: string) {
  const v = validateFlowSource(src);
  if (v.ok) throw new Error('expected invalid');
  return v.issues;
}

describe('validateFlowSource', () => {
  it('accepts the brief example including shorthand expect lines', () => {
    const v = validateFlowSource(GOOD);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.flow.login).toBe('test-buyer');
    expect(v.flow.steps[1]).toEqual({ text: 'Open the cart', expect: 'cart shows 1 item, total $49.00' });
    expect(v.flow.steps[2]).toEqual({ text: 'Pay with the test card', expect: 'confirmation page shows an order number' });
    expect(v.warnings).toEqual([]);
  });

  it('keeps line numbers when rewriting shorthand', () => {
    expect(normalizeShorthand(GOOD).split('\n')).toHaveLength(GOOD.split('\n').length);
  });

  it('names a missing required field', () => {
    expect(issues('flow: X\nsteps:\n  - a\n    expect: total is 5\n')[0]?.message).toContain('start: is required');
  });

  it('names the line of an unknown key', () => {
    const i = issues('flow: X\nstart: /\nstepz: []\nsteps:\n  - step: a\n    expect: total is 5\n').find((x) => x.line === 3);
    expect(i?.message).toContain('unknown key "stepz"');
  });

  it('rejects passwords and other secrets, without echoing the value', () => {
    const i = issues('flow: X\nstart: /\npassword: hunter2\nsteps:\n  - step: a\n    expect: x is 5\n');
    expect(i[0]?.line).toBe(3);
    expect(i[0]?.message).toContain('never contain secrets');
    expect(JSON.stringify(i)).not.toContain('hunter2');
  });

  it('rejects a login that is not an account name', () => {
    expect(issues('flow: X\nstart: /\nlogin: "my pass word"\nsteps:\n  - step: a\n    expect: x is 5\n')[0]?.line).toBe(3);
  });

  it('requires at least one expect', () => {
    expect(issues('flow: X\nstart: /\nsteps:\n  - just do it\n').some((i) => i.message.includes('at least one "expect:"'))).toBe(true);
  });

  it('requires a start that is a path or http(s) URL', () => {
    expect(issues('flow: X\nstart: products\nsteps:\n  - step: a\n    expect: x is 5\n')[0]?.message).toContain('start must be a path');
  });

  it('reports YAML syntax problems', () => {
    expect(issues('flow: [unclosed\n')[0]?.message).toContain('YAML syntax problem');
  });

  it('warns about a vague expectation and names the step', () => {
    const v = validateFlowSource('flow: X\nstart: /\nsteps:\n  - step: Open orders\n    expect: the page looks fine\n');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.warnings).toHaveLength(1);
    expect(v.warnings[0]?.step).toBe(1);
    expect(v.warnings[0]?.message).toContain('Vague expectation');
  });
});

describe('isVagueExpectation', () => {
  it('flags vague words without a concrete claim, passes checkable ones', () => {
    expect(isVagueExpectation('the page looks fine')).toBe(true);
    expect(isVagueExpectation('should work properly')).toBe(true);
    expect(isVagueExpectation('total becomes $44.10')).toBe(false);
    expect(isVagueExpectation('the new order appears with status "Paid"')).toBe(false);
  });
});

describe('YAML round trip', () => {
  it('writes a draft that validates and loads back the same', () => {
    const draft = {
      name: 'Checkout: card & "coupon"',
      start: '/products',
      login: 'test-buyer',
      tags: ['payments', 'critical'],
      steps: [
        { text: 'Add "Blue T-shirt, size M" to the cart', expect: '' },
        { text: 'Open the cart', expect: 'cart shows 1 item, total $49.00' },
      ],
      variations: ['try an expired coupon'],
    };
    const yaml = draftToYaml(draft);
    expect(validateFlowSource(yaml).ok).toBe(true);
    expect(yamlToDraft(yaml)).toEqual(draft);
  });

  it('drops blank rows and fields, and leaves required blanks for validation to name', () => {
    const d = { ...emptyDraft(), tags: [' ', 'a'], variations: [''], steps: [{ text: ' ', expect: '' }] };
    const yaml = draftToYaml(d);
    expect(yaml).not.toContain('variations');
    expect(issues(yaml).map((i) => i.message).join('|')).toContain('flow must not be empty');
  });

  it('loads the shorthand layout and refuses non-mappings', () => {
    expect(yamlToDraft(GOOD)?.steps[2]).toEqual({ text: 'Pay with the test card', expect: 'confirmation page shows an order number' });
    expect(yamlToDraft('- a\n- b\n')).toBeUndefined();
  });

  it('keeps tricky text as text, not YAML syntax', () => {
    const d = { ...emptyDraft(), name: 'X', steps: [{ text: 'a: b # c', expect: '- total is 5' }] };
    expect(yamlToDraft(draftToYaml(d))?.steps[0]).toEqual({ text: 'a: b # c', expect: '- total is 5' });
  });
});
