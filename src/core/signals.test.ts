import { describe, expect, it } from 'vitest';
import { findingKindFor } from './signals.js';

const s = (kind: Parameters<typeof findingKindFor>[0]['kind'], message = 'm') => ({
  kind,
  message,
  at: 'now',
});

describe('findingKindFor', () => {
  it('maps bug signals', () => {
    expect(findingKindFor(s('page-error'))).toBe('js-error');
    expect(findingKindFor(s('http-5xx'))).toBe('http-5xx');
    expect(findingKindFor(s('page-not-found'))).toBe('dead-link');
    expect(findingKindFor(s('console-error', 'Uncaught thing'))).toBe('console-error');
  });
  it('ignores policy signals and resource-load noise', () => {
    expect(findingKindFor(s('blocked-request'))).toBeUndefined();
    expect(findingKindFor(s('request-failed'))).toBeUndefined();
    expect(findingKindFor(s('console-error', 'Failed to load resource: 500'))).toBeUndefined();
  });
});
