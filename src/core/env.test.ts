import { describe, expect, it } from 'vitest';
import { loadAiEnv, loadBudgets, loadDbEnv, loadReportEnv, redactDbUrl } from './env.js';
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

describe('loadReportEnv', () => {
  it('has safe defaults and needs no repository', () => {
    const e = loadReportEnv({});
    expect(e).toMatchObject({ minSeverity: 'medium', fixMode: 'auto', maxFixPerNight: 3 });
    expect(e.repo).toBeUndefined();
  });
  it('treats blank values from .env as not set', () => {
    const e = loadReportEnv({
      NIGHTQA_GITHUB_REPO: '',
      GITHUB_TOKEN: '',
      NIGHTQA_PUBLIC_URL: '',
      NIGHTQA_MIN_SEVERITY: '',
    });
    expect(e.repo).toBeUndefined();
    expect(e.minSeverity).toBe('medium');
  });
  it('requires a token when a repository is set', () => {
    expect(() => loadReportEnv({ NIGHTQA_GITHUB_REPO: 'a/b' })).toThrow(/GITHUB_TOKEN/);
    expect(loadReportEnv({ NIGHTQA_GITHUB_REPO: 'a/b', GITHUB_TOKEN: 't' }).repo).toBe('a/b');
  });
  it('rejects bad values', () => {
    expect(() => loadReportEnv({ NIGHTQA_FIX_PRS: 'sometimes' })).toThrow();
    expect(() => loadReportEnv({ NIGHTQA_MIN_SEVERITY: 'huge' })).toThrow();
  });
});

describe('loadDbEnv', () => {
  it('is undefined when DATABASE_URL is missing or blank', () => {
    expect(loadDbEnv({})).toBeUndefined();
    expect(loadDbEnv({ DATABASE_URL: '  ' })).toBeUndefined();
  });
  it('reads the url and applies defaults', () => {
    expect(loadDbEnv({ DATABASE_URL: 'postgres://u:p@db:5432/nightqa' })).toEqual({
      url: 'postgres://u:p@db:5432/nightqa',
      poolMax: 5,
      connectTimeoutMs: 5000,
      statementTimeoutMs: 15000,
    });
  });
  it('rejects a non-postgres url without echoing it', () => {
    let message = '';
    try {
      loadDbEnv({ DATABASE_URL: 'mysql://u:secret@db/x' });
    } catch (e) {
      message = e instanceof Error ? e.message : '';
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('secret');
  });
});

describe('redactDbUrl', () => {
  it('hides the password', () => {
    expect(redactDbUrl('postgres://u:secret@db:5432/x')).toBe('postgres://u:***@db:5432/x');
    expect(redactDbUrl('not a url')).toBe('(invalid database url)');
  });
});
