import { describe, expect, it } from 'vitest';
import { FlowValidationError } from '../errors.js';
import { normalizeShorthand, parseFlow } from './parse.js';
import { isVagueExpectation } from './vague.js';

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

function errorOf(src: string): FlowValidationError {
  try {
    parseFlow(src, 'f.yaml');
  } catch (e) {
    if (e instanceof FlowValidationError) return e;
    throw e;
  }
  throw new Error('expected FlowValidationError');
}

describe('parseFlow', () => {
  it('parses the brief example including shorthand expect lines', () => {
    const { flow, warnings } = parseFlow(GOOD);
    expect(flow.flow).toBe('Checkout with card');
    expect(flow.login).toBe('test-buyer');
    expect(flow.tags).toEqual(['payments', 'critical']);
    expect(flow.steps).toEqual([
      { text: 'Add "Blue T-shirt, size M" to the cart' },
      { text: 'Open the cart', expect: 'cart shows 1 item, total $49.00' },
      { text: 'Pay with the test card', expect: 'confirmation page shows an order number' },
    ]);
    expect(flow.variations).toEqual(['try an expired coupon']);
    expect(warnings).toEqual([]);
  });

  it('keeps line numbers when rewriting shorthand', () => {
    const src = GOOD.replace('step: Open the cart', 'Open the cart');
    expect(normalizeShorthand(src).split('\n')).toHaveLength(src.split('\n').length);
    expect(parseFlow(src).flow.steps[1]?.expect).toBe('cart shows 1 item, total $49.00');
  });

  it('names the line of a missing required field', () => {
    const e = errorOf('flow: X\nsteps:\n  - a\n    expect: total is 5\n');
    expect(e.issues[0]?.message).toContain('start: is required');
  });

  it('names the line of an unknown key', () => {
    const e = errorOf(
      'flow: X\nstart: /\nstepz: []\nsteps:\n  - step: a\n    expect: total is 5\n',
    );
    const issue = e.issues.find((i) => i.line === 3);
    expect(issue?.message).toContain('unknown key "stepz"');
  });

  it('rejects passwords and other secrets in flow files', () => {
    const e = errorOf(
      'flow: X\nstart: /\npassword: hunter2\nsteps:\n  - step: a\n    expect: x is 5\n',
    );
    expect(e.issues[0]?.line).toBe(3);
    expect(e.issues[0]?.message).toContain('never contain secrets');
    expect(e.message).not.toContain('hunter2');
  });

  it('rejects a login that is not an account name', () => {
    const e = errorOf(
      'flow: X\nstart: /\nlogin: "my pass word"\nsteps:\n  - step: a\n    expect: x is 5\n',
    );
    expect(e.issues[0]?.line).toBe(3);
  });

  it('requires at least one expect', () => {
    const e = errorOf('flow: X\nstart: /\nsteps:\n  - open page\n');
    expect(e.issues[0]?.message).toContain('at least one "expect:"');
  });

  it('requires at least one step', () => {
    expect(errorOf('flow: X\nstart: /\nsteps: []\n').issues[0]?.message).toContain(
      'at least one step',
    );
  });

  it('rejects a start that is neither a path nor a URL', () => {
    expect(errorOf('flow: X\nstart: products\nsteps: [a]\n').issues[0]?.message).toContain(
      'start must be',
    );
  });

  it('reports YAML syntax errors with a line', () => {
    const e = errorOf('flow: X\nstart: [unclosed\n');
    expect(e.issues[0]?.message).toContain('YAML syntax problem');
    expect(e.issues[0]?.line).toBeGreaterThanOrEqual(1);
  });

  it('warns about vague expectations with a better example', () => {
    const { warnings } = parseFlow(
      'flow: X\nstart: /\nsteps:\n  - step: Open the cart\n    expect: looks fine\n',
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.line).toBe(4);
    expect(warnings[0]?.message).toContain('for example');
  });
});

describe('isVagueExpectation', () => {
  it.each(['looks fine', 'works', 'page is OK', 'everything is correct', 'it works properly'])(
    'flags "%s"',
    (s) => {
      expect(isVagueExpectation(s)).toBe(true);
    },
  );
  it.each([
    'cart shows 1 item, total $49.00',
    'confirmation page shows an order number',
    'url contains /orders/',
    'the error "Coupon expired" is shown',
  ])('accepts "%s"', (s) => {
    expect(isVagueExpectation(s)).toBe(false);
  });
});
