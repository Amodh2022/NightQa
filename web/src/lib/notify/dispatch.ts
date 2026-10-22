import type { Report } from '../report';
import { getSettings, type Settings } from '../settings';
import { VaultError, getSecret, listSecretNames } from '../vault';
import { recordDelivery, type Delivery } from './log';
import { CHANNELS, type Channel, type DeliveryResult, type Sender } from './port';
import { emailSender, slackSender, webhookSender, type EmailDeps } from './senders';

/** The vault names another part of the dashboard saves. Only the names are used here; values stay on the server. */
export const SECRET_NAMES = {
  slack: 'notify:slack-webhook',
  webhook: 'notify:webhook-url',
  smtpUrl: 'notify:smtp-url',
  smtpFrom: 'notify:smtp-from',
} as const;

export interface ChannelState {
  readonly channel: Channel;
  readonly enabled: boolean;
  /** Everything needed to send is saved. */
  readonly configured: boolean;
  /** One short line for the screen. */
  readonly detail: string;
}

export function channelStates(settings: Settings, secretNames: readonly string[]): ChannelState[] {
  const has = (n: string): boolean => secretNames.includes(n);
  const n = settings.notifications;
  const emailOk = has(SECRET_NAMES.smtpUrl) && has(SECRET_NAMES.smtpFrom) && n.email.to.length > 0;
  return [
    {
      channel: 'email',
      enabled: n.email.enabled,
      configured: emailOk,
      detail: !has(SECRET_NAMES.smtpUrl) || !has(SECRET_NAMES.smtpFrom) ? 'Mail server not saved yet' : n.email.to.length === 0 ? 'No recipients yet' : `${String(n.email.to.length)} recipient${n.email.to.length === 1 ? '' : 's'}`,
    },
    { channel: 'slack', enabled: n.slack.enabled, configured: has(SECRET_NAMES.slack), detail: has(SECRET_NAMES.slack) ? 'Webhook saved' : 'Webhook not saved yet' },
    { channel: 'webhook', enabled: n.webhook.enabled, configured: has(SECRET_NAMES.webhook), detail: has(SECRET_NAMES.webhook) ? 'Address saved' : 'Address not saved yet' },
  ];
}

export interface DispatchDeps {
  readonly settings?: Settings;
  readonly secret?: (name: string) => Promise<string | undefined>;
  readonly http?: EmailDeps;
  readonly dir?: string;
  readonly now?: () => Date;
  readonly record?: (d: Omit<Delivery, 'at'>) => Promise<void>;
}

const vaultSecret = (name: string): Promise<string | undefined> => getSecret(name).catch((e: unknown) => (e instanceof VaultError ? undefined : Promise.reject(e)));

async function buildSender(channel: Channel, settings: Settings, secret: (n: string) => Promise<string | undefined>, http: EmailDeps): Promise<Sender | string> {
  if (channel === 'slack') {
    const url = await secret(SECRET_NAMES.slack);
    return url ? slackSender(url, http) : 'Not connected: no Slack webhook is saved.';
  }
  if (channel === 'webhook') {
    const url = await secret(SECRET_NAMES.webhook);
    return url ? webhookSender(url, http) : 'Not connected: no webhook address is saved.';
  }
  const [smtpUrl, from] = await Promise.all([secret(SECRET_NAMES.smtpUrl), secret(SECRET_NAMES.smtpFrom)]);
  if (!smtpUrl || !from) return 'Not connected: the mail server is not saved.';
  return emailSender({ smtpUrl, from, to: settings.notifications.email.to }, http);
}

export interface DispatchOptions {
  readonly kind: Delivery['kind'];
  /** Send to this one channel even if it is switched off (used by "Send test message"). */
  readonly only?: Channel;
  readonly bugId?: string;
}

/**
 * Sends a report to every enabled and connected channel (or to `only`) and records each result in the delivery log.
 * Never throws. A channel that is on but not connected is recorded as failed so the screen can say so.
 */
export async function deliver(report: Report, opts: DispatchOptions, deps: DispatchDeps = {}): Promise<DeliveryResult[]> {
  try {
    const settings = deps.settings ?? (await getSettings());
    const secret = deps.secret ?? vaultSecret;
    const http: EmailDeps = { dashboardUrl: process.env.NIGHTQA_PUBLIC_URL, ...deps.http };
    const record = deps.record ?? ((d: Omit<Delivery, 'at'>) => recordDelivery(d, deps.dir, deps.now));
    const targets = opts.only ? [opts.only] : CHANNELS.filter((c) => settings.notifications[c].enabled);
    const results: DeliveryResult[] = [];
    for (const channel of targets) {
      let result: DeliveryResult;
      try {
        const sender = await buildSender(channel, settings, secret, http);
        result = typeof sender === 'string' ? { channel, ok: false, reason: sender } : await sender.send(report);
      } catch {
        result = { channel, ok: false, reason: 'Could not send.' };
      }
      results.push(result);
      await record({ channel, kind: opts.kind, ok: result.ok, reason: result.reason, subject: report.subject, ...(opts.bugId ? { bugId: opts.bugId } : {}) }).catch(() => undefined);
    }
    return results;
  } catch {
    return [];
  }
}

export async function connectionStates(settings?: Settings): Promise<ChannelState[]> {
  const s = settings ?? (await getSettings());
  return channelStates(s, await listSecretNames().catch(() => []));
}
