import { describe, expect, it } from 'vitest';
import { RateLimiter, clientKey } from './rate-limit';

describe('RateLimiter', () => {
  it('blocks after max events in the window and recovers as they age out', () => {
    let t = 0;
    const l = new RateLimiter(3, 1000, () => t);
    for (let i = 0; i < 3; i++) {
      expect(l.allowed('a')).toBe(true);
      l.record('a');
      t += 100;
    }
    expect(l.allowed('a')).toBe(false);
    expect(l.allowed('b')).toBe(true);
    expect(l.retryAfterSeconds('a')).toBe(1);
    t += 801;
    expect(l.allowed('a')).toBe(true);
    expect(l.retryAfterSeconds('a')).toBe(0);
  });
  it('trusts forwarding headers only when told to', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
    expect(clientKey(h, {})).toBe('shared');
    expect(clientKey(h, { NIGHTQA_TRUST_PROXY: '1' })).toBe('203.0.113.9');
    expect(clientKey(new Headers(), { NIGHTQA_TRUST_PROXY: '1' })).toBe('shared');
  });
});
