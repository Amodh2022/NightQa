import { describe, expect, it } from 'vitest';
import { loadAiEnv, loadBudgets } from './env.js';
import { EnvError } from './errors.js';

const GOOD = {
  ANTHROPIC_API_KEY: 'k',
  NIGHTQA_MODEL_STRONG: 'm1',
  NIGHTQA_PRICE_STRONG_INPUT_PER_MTOK: '2',
  NIGHTQA_PRICE_STRONG_OUTPUT_PER_MTOK: '10',
};

describe('loadAiEnv', () => {
  it('reads model, prices and defaults effort to low', () => {
    const e = loadAiEnv(GOOD);
    expect(e).toMatchObject({
      modelStrong: 'm1',
      priceInputPerMtok: 2,
      priceOutputPerMtok: 10,
      effort: 'low',
    });
  });
  it('lists every problem at once', () => {
    try {
      loadAiEnv({});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as EnvError).problems.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('loadBudgets', () => {
  it('defaults to 40 steps, 300 seconds, $0.50', () => {
    expect(loadBudgets({})).toEqual({ maxSteps: 40, maxSeconds: 300, maxCostUsd: 0.5 });
  });
  it('accepts overrides and rejects nonsense', () => {
    expect(loadBudgets({ NIGHTQA_MAX_STEPS: '10' }).maxSteps).toBe(10);
    expect(() => loadBudgets({ NIGHTQA_MAX_STEPS: '-1' })).toThrow(EnvError);
  });
});
