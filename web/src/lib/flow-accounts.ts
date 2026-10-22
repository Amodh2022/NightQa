import { listSecretNames } from './vault';

/** Saved test account names from secret names like `account:test-buyer:password`. Names only, never values. */
export function accountNamesFrom(secretNames: readonly string[]): string[] {
  const names = secretNames.flatMap((n) => {
    const m = /^account:([A-Za-z0-9][\w-]*):password$/.exec(n);
    return m?.[1] ? [m[1]] : [];
  });
  return [...new Set(names)].sort();
}

export async function listAccountNames(): Promise<string[]> {
  return accountNamesFrom(await listSecretNames().catch(() => []));
}
