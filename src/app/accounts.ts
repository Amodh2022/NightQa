import type { Account } from '../core/redact.js';
import { accountEnvVar } from '../core/specgen.js';

/** Looks up a saved test account by name from the environment. Never read from flow files. */
export function accountFor(
  login: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): Account | undefined {
  if (!login) return undefined;
  const username = env[accountEnvVar(login, 'USERNAME')];
  const password = env[accountEnvVar(login, 'PASSWORD')];
  return username && password ? { username, password } : undefined;
}
