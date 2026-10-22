import { describe, expect, it } from 'vitest';
import { accountNamesFrom } from './flow-accounts';

describe('accountNamesFrom', () => {
  it('keeps only account names, sorted and unique', () => {
    expect(accountNamesFrom(['account:b:password', 'account:a:password', 'account:a:password', 'github-token', 'account:x:username', 'account:bad name:password'])).toEqual(['a', 'b']);
  });
});
