const MIN_SECRET_LENGTH = 4;

export const REDACTED = '[REDACTED]';

/** Replaces every known secret value inside a string. Longer secrets first, so overlaps cannot leak. */
export function redactString(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const s of [...secrets]
    .filter((x) => x.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length)) {
    out = out.split(s).join(REDACTED);
  }
  return out;
}

/** Deep-copies a value with every known secret removed from all strings (including keys). */
export function redactDeep<T>(value: T, secrets: readonly string[]): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return redactString(v, secrets);
    if (Array.isArray(v)) return v.map(walk);
    if (v instanceof Uint8Array) return v;
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [redactString(k, secrets), walk(x)]),
      );
    }
    return v;
  };
  return walk(value) as T;
}

const PLACEHOLDER = /\{\{account\.(username|password)\}\}/g;

/** Test-account credentials, resolved only at the moment of typing. */
export interface Account {
  readonly username: string;
  readonly password: string;
}

/**
 * The model types `{{account.username}}` / `{{account.password}}`; real values are substituted just before
 * typing and never appear in prompts, logs or recorded actions.
 */
export function resolvePlaceholders(text: string, account: Account | undefined): string {
  return text.replace(PLACEHOLDER, (_, which: 'username' | 'password') => {
    if (!account)
      throw new Error('This flow has no login, so account placeholders are not available');
    return account[which];
  });
}

export function usesPlaceholder(text: string): boolean {
  return new RegExp(PLACEHOLDER.source).test(text);
}
