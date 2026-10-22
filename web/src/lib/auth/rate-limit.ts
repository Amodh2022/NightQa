/** Sliding-window counter per key. The clock is injected so it can be tested. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const live = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (live.length === 0) this.hits.delete(key);
    else this.hits.set(key, live);
    return live;
  }

  /** True when `key` may act now (fewer than `max` events recorded in the window). */
  allowed(key: string): boolean {
    return this.recent(key).length < this.max;
  }

  /** Records one event for `key`. */
  record(key: string): void {
    this.hits.set(key, [...this.recent(key), this.now()]);
  }

  /** Seconds until `key` may act again (0 when it already may). */
  retryAfterSeconds(key: string): number {
    const live = this.recent(key);
    if (live.length < this.max) return 0;
    const oldestBlocking = live[live.length - this.max] ?? this.now();
    return Math.max(1, Math.ceil((oldestBlocking + this.windowMs - this.now()) / 1000));
  }

  /** Memory guard: forget keys with no recent events. */
  sweep(): void {
    for (const k of [...this.hits.keys()]) this.recent(k);
  }
}

/**
 * Who is asking. Forwarding headers are only believed behind a proxy you operate (NIGHTQA_TRUST_PROXY=1);
 * otherwise everyone shares one bucket, which still caps total sign-in attempts.
 */
export function clientKey(headers: Headers, env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (env.NIGHTQA_TRUST_PROXY !== '1') return 'shared';
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd && fwd.length < 64 ? fwd : 'shared';
}

/** Sign-in starts (GitHub redirects) and failed callbacks, per client. Module-level so it lives as long as the server. */
export const startLimiter = new RateLimiter(20, 60_000);
export const failureLimiter = new RateLimiter(8, 10 * 60_000);
