import { describe, expect, it } from 'vitest';
import { accountsFromSecretNames, isCompleteAccount } from './accounts';

describe('accountsFromSecretNames', () => {
  it('groups names and links flows', () => {
    const a = accountsFromSecretNames(
      ['github:token', 'account:buyer:password', 'account:buyer:username', 'account:half:username'],
      [{ name: 'Checkout', login: 'buyer' }, { name: 'Search' }],
    );
    expect(a.map((x) => x.name)).toEqual(['buyer', 'half']);
    expect(a[0]?.usedBy).toEqual(['Checkout']);
    expect(a.map(isCompleteAccount)).toEqual([true, false]);
  });
});
