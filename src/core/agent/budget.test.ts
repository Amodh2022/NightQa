import { describe, expect, it } from 'vitest';
import { BudgetExceededError } from '../errors.js';
import { BudgetTracker } from './budget.js';

const limits = { maxSteps: 3, maxSeconds: 10, maxCostUsd: 0.5 };

function setup() {
  let t = 0;
  const clock = { now: () => t };
  return { b: new BudgetTracker(limits, clock), advance: (s: number) => (t += s * 1000) };
}

describe('BudgetTracker', () => {
  it('passes while under every limit', () => {
    const { b } = setup();
    b.recordStep();
    b.addCost(0.1);
    expect(() => {
      b.check();
    }).not.toThrow();
    expect(b.stepsLeft).toBe(2);
  });
  it('throws when steps run out', () => {
    const { b } = setup();
    for (let i = 0; i < 3; i++) b.recordStep();
    expect(() => {
      b.check();
    }).toThrow(BudgetExceededError);
  });
  it('throws when time runs out', () => {
    const { b, advance } = setup();
    advance(10);
    expect(() => {
      b.check();
    }).toThrow(/seconds/);
  });
  it('throws when cost runs out', () => {
    const { b } = setup();
    b.addCost(0.5);
    expect(() => {
      b.check();
    }).toThrow(/cost/);
    expect(b.spentUsd).toBe(0.5);
  });
});
