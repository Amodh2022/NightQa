import { describe, expect, it } from 'vitest';
import { newRunId } from './ids.js';

describe('newRunId', () => {
  it('returns a 26-character ULID', () => {
    expect(newRunId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('returns unique ids', () => {
    expect(newRunId()).not.toBe(newRunId());
  });
});
