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

describe('loadAiEnv with the NVIDIA provider', () => {
  const nvidia = {
    NIGHTQA_PROVIDER: 'nvidia',
    NVIDIA_API_KEY: 'nvapi-x',
    NIGHTQA_MODEL_STRONG: 'meta/muse-glimmer-30b',
  };
  it('needs only a key and a model; prices default to 0 (free trial)', () => {
    expect(loadAiEnv(nvidia)).toMatchObject({
      provider: 'nvidia',
      apiKey: 'nvapi-x',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      priceInputPerMtok: 0,
      priceOutputPerMtok: 0,
      temperature: 0.2,
    });
  });
  it('asks for the NVIDIA key, not the Anthropic one', () => {
    try {
      loadAiEnv({ NIGHTQA_PROVIDER: 'nvidia', NIGHTQA_MODEL_STRONG: 'm', ANTHROPIC_API_KEY: 'k' });
      expect.unreachable();
    } catch (e) {
      expect((e as EnvError).problems.join(' ')).toContain('NVIDIA_API_KEY');
    }
  });
  it('still requires prices for Anthropic and rejects an unknown provider', () => {
    expect(() => loadAiEnv({ ANTHROPIC_API_KEY: 'k', NIGHTQA_MODEL_STRONG: 'm' })).toThrow(/PRICE/);
    expect(() => loadAiEnv({ NIGHTQA_PROVIDER: 'foo', NIGHTQA_MODEL_STRONG: 'm' })).toThrow(
      /anthropic/,
    );
  });
  it('allows a custom base URL and temperature', () => {
    const e = loadAiEnv({
      ...nvidia,
      NIGHTQA_BASE_URL: 'https://nim.example.com/v1',
      NIGHTQA_TEMPERATURE: '0.5',
    });
    expect(e).toMatchObject({ baseUrl: 'https://nim.example.com/v1', temperature: 0.5 });
  });
});
