import { UnsafeTargetError, assertSafeTarget, type TargetRules } from './host-safety';
import type { HttpDeps } from './port';

export interface PostResult {
  readonly ok: boolean;
  /** Short and safe: never the URL, the body or anything the server said. */
  readonly reason: string;
}

const RETRY_AFTER_CAP_MS = 10_000;

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Full jitter backoff: a random wait up to 500 ms * 2^attempt (capped at 8 s). */
export function backoffMs(attempt: number, random: () => number): number {
  return Math.round(random() * Math.min(8_000, 500 * 2 ** attempt));
}

/**
 * POSTs JSON to an https address that passed the host check. Retries 429, 5xx, timeouts and network errors with
 * backoff and jitter; any other answer is final. Redirects are refused so a good host cannot bounce us elsewhere.
 * Never throws and never puts the address in the result.
 */
export async function postJson(url: string, body: unknown, rules: TargetRules, deps: HttpDeps = {}): Promise<PostResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const attempts = Math.max(1, deps.maxAttempts ?? 3);
  const timeoutMs = deps.timeoutMs ?? 10_000;
  let target: URL;
  try {
    target = await assertSafeTarget(url, rules, deps.resolve);
  } catch (e) {
    return { ok: false, reason: e instanceof UnsafeTargetError ? `Blocked: ${e.message}` : 'Blocked: the address could not be checked.' };
  }
  const payload = JSON.stringify(body);
  let last = 'Could not reach the server.';
  for (let attempt = 0; attempt < attempts; attempt++) {
    let wait = backoffMs(attempt, random);
    try {
      const res = await fetchImpl(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 200 && res.status < 300) return { ok: true, reason: 'Delivered' };
      if (res.status >= 300 && res.status < 400) return { ok: false, reason: 'The address redirected, which is not allowed.' };
      last = `The server answered HTTP ${String(res.status)}.`;
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after'));
        if (Number.isFinite(ra) && ra > 0) wait = Math.min(RETRY_AFTER_CAP_MS, Math.max(wait, ra * 1000));
      } else if (res.status < 500) {
        return { ok: false, reason: last };
      }
    } catch (e) {
      last = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'The request timed out.' : 'Could not reach the server.';
    }
    if (attempt < attempts - 1) await sleep(wait);
  }
  return { ok: false, reason: last };
}
