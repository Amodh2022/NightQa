import type { Report } from '../report';

export type Channel = 'email' | 'slack' | 'webhook';
export const CHANNELS: readonly Channel[] = ['email', 'slack', 'webhook'];

/** What one attempt to deliver looked like. `reason` is short and never contains a secret, an address or a URL. */
export interface DeliveryResult {
  readonly channel: Channel;
  readonly ok: boolean;
  readonly reason: string;
}

/** A way to deliver a report. Implementations must not throw: failures come back as `ok: false`. */
export interface Sender {
  readonly channel: Channel;
  send(report: Report): Promise<DeliveryResult>;
}

export interface HttpDeps {
  readonly fetchImpl?: typeof fetch;
  readonly resolve?: (host: string) => Promise<string[]>;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  /** Public dashboard address, used for "Open the dashboard" links. */
  readonly dashboardUrl?: string | undefined;
}
