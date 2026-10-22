import { describe, expect, it } from 'vitest';
import { TimeoutError, isTransientError, retryTransient, withTimeout } from './retry.js';

const fast = { sleep: () => Promise.resolve(), random: () => 0.5 };

describe('retryTransient', () => {
  it('retries transient errors with growing, jittered delays then succeeds', async () => {
    const delays: number[] = [];
    let n = 0;
    const out = await retryTransient(
      () => {
        if (++n < 3) return Promise.reject(Object.assign(new Error('x'), { status: 503 }));
        return Promise.resolve('ok');
      },
      { baseMs: 100, random: () => 1, sleep: (ms) => (delays.push(ms), Promise.resolve()) },
    );
    expect(out).toBe('ok');
    expect(delays).toEqual([100, 200]);
  });
  it('does not retry a 4xx', async () => {
    let n = 0;
    await expect(
      retryTransient(
        () => (n++, Promise.reject(Object.assign(new Error('no'), { status: 404 }))),
        fast,
      ),
    ).rejects.toThrow('no');
    expect(n).toBe(1);
  });
  it('gives up after the retry budget', async () => {
    let n = 0;
    await expect(
      retryTransient(() => (n++, Promise.reject(Object.assign(new Error('x'), { status: 500 }))), {
        ...fast,
        retries: 2,
      }),
    ).rejects.toThrow('x');
    expect(n).toBe(3);
  });
  it('classifies errors', () => {
    expect(isTransientError(Object.assign(new Error(), { status: 429 }))).toBe(true);
    expect(isTransientError(Object.assign(new Error(), { status: 422 }))).toBe(false);
    expect(isTransientError(new TimeoutError('x', 1))).toBe(true);
    expect(isTransientError(new TypeError('fetch failed'))).toBe(true);
  });
});

describe('withTimeout', () => {
  it('rejects a call that takes too long', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20, 'slow')).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });
  it('passes through a fast call', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, 'fast')).resolves.toBe(7);
  });
});
