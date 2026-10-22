import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  redactDeep,
  redactString,
  resolvePlaceholders,
  usesPlaceholder,
} from './redact.js';

describe('redact', () => {
  it('removes secrets from strings, longest first', () => {
    expect(redactString('pw=hunter22 and hunter2', ['hunter2', 'hunter22'])).toBe(
      `pw=${REDACTED} and ${REDACTED}`,
    );
  });
  it('ignores very short secrets that would shred normal text', () => {
    expect(redactString('a b c', ['a'])).toBe('a b c');
  });
  it('redacts deep structures, keys included', () => {
    const out = redactDeep({ a: ['x secret-1 y'], 'secret-1': { b: 'secret-1' }, n: 3 }, [
      'secret-1',
    ]);
    expect(JSON.stringify(out)).not.toContain('secret-1');
    expect(out.n).toBe(3);
  });
  it('resolves account placeholders only when an account exists', () => {
    const acct = { username: 'buyer@example.com', password: 'zoo-pass' };
    expect(resolvePlaceholders('{{account.username}}', acct)).toBe('buyer@example.com');
    expect(resolvePlaceholders('{{account.password}}!', acct)).toBe('zoo-pass!');
    expect(() => resolvePlaceholders('{{account.password}}', undefined)).toThrow('no login');
    expect(resolvePlaceholders('plain', undefined)).toBe('plain');
    expect(usesPlaceholder('x {{account.password}}')).toBe(true);
    expect(usesPlaceholder('x')).toBe(false);
  });
});
