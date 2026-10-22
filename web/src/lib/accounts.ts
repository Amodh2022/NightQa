import type { FlowInfo } from './flows';

export const ACCOUNT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

export interface AccountView {
  readonly name: string;
  readonly hasUsername: boolean;
  readonly hasPassword: boolean;
  /** Flow names whose `login:` refers to this account. */
  readonly usedBy: readonly string[];
}

const RE = /^account:([^:]+):(username|password|otp)$/;

/** Groups vault names into accounts. Takes names only, so no value can reach the page. */
export function accountsFromSecretNames(names: readonly string[], flows: readonly Pick<FlowInfo, 'name' | 'login'>[]): AccountView[] {
  const map = new Map<string, { u: boolean; p: boolean }>();
  for (const n of names) {
    const m = RE.exec(n);
    if (!m?.[1]) continue;
    const cur = map.get(m[1]) ?? { u: false, p: false };
    if (m[2] === 'username') cur.u = true;
    if (m[2] === 'password') cur.p = true;
    map.set(m[1], cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, v]) => ({ name, hasUsername: v.u, hasPassword: v.p, usedBy: flows.filter((f) => f.login === name).map((f) => f.name) }));
}

export const accountSecretNames = (name: string): string[] => [`account:${name}:username`, `account:${name}:password`, `account:${name}:otp`];
export const isCompleteAccount = (a: AccountView): boolean => a.hasUsername && a.hasPassword;
