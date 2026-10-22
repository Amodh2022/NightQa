export interface RetryOptions {
  /** Retries after the first try. Default 3. */
  readonly retries?: number;
  readonly baseMs?: number;
  readonly maxMs?: number;
  readonly isTransient?: (e: unknown) => boolean;
  /** Replaceable in tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** 0..1, replaceable in tests. */
  readonly random?: () => number;
}

/** Network trouble, timeouts, rate limits and 5xx are worth another try; a 4xx is not. */
export function isTransientError(e: unknown): boolean {
  if (e instanceof TimeoutError) return true;
  const status = (e as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return status === 429 || status === 403 || status >= 500;
  return (
    e instanceof TypeError || (e instanceof Error && /fetch|network|socket|ECONN/i.test(e.message))
  );
}

export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} timed out after ${String(ms)} ms`);
    this.name = 'TimeoutError';
  }
}

/** Rejects if `p` takes longer than `ms`. */
export async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(what, ms));
    }, ms);
  });
  try {
    return await Promise.race([p, limit]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Retries `fn` on transient errors with exponential backoff and jitter. */
export async function retryTransient<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseMs ?? 500;
  const max = opts.maxMs ?? 8000;
  const transient = opts.isTransient ?? isTransientError;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= retries || !transient(e)) throw e;
      const ceiling = Math.min(max, base * 2 ** attempt);
      await sleep(Math.round(ceiling / 2 + (random() * ceiling) / 2));
    }
  }
}
