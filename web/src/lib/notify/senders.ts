import nodemailer, { type Transporter } from 'nodemailer';
import type { Report } from '../report';
import { clean } from '../report';
import { toHtml, toPlainText, toSlackText, toWebhookBody } from './format';
import { postJson } from './http';
import type { DeliveryResult, HttpDeps, Sender } from './port';

/** Hosts a Slack incoming webhook may use. Operators of Slack-compatible services can extend this in the environment. */
export function slackHosts(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  const extra = (env.NIGHTQA_SLACK_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return ['hooks.slack.com', ...extra];
}

export function slackSender(webhookUrl: string, deps: HttpDeps = {}, hosts: readonly string[] = slackHosts()): Sender {
  return {
    channel: 'slack',
    async send(report: Report): Promise<DeliveryResult> {
      if (/^https:\/\/hooks\.slack\.com(?![^/])/i.test(webhookUrl) && !/^https:\/\/hooks\.slack\.com\/services\//i.test(webhookUrl)) {
        return { channel: 'slack', ok: false, reason: 'Blocked: that address does not look like a Slack webhook.' };
      }
      const r = await postJson(webhookUrl, { text: toSlackText(report, deps.dashboardUrl) }, { allowedHosts: hosts, pathPrefix: '/' }, deps);
      return { channel: 'slack', ok: r.ok, reason: r.ok ? 'Delivered' : r.reason };
    },
  };
}

export function webhookSender(webhookUrl: string, deps: HttpDeps = {}): Sender {
  return {
    channel: 'webhook',
    async send(report: Report): Promise<DeliveryResult> {
      const r = await postJson(webhookUrl, toWebhookBody(report, deps.dashboardUrl), {}, deps);
      return { channel: 'webhook', ok: r.ok, reason: r.ok ? 'Delivered' : r.reason };
    },
  };
}

const EMAIL_RE = /^[^\s@<>",;()[\]\\]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export const isEmailAddress = (s: string): boolean => s.length <= 254 && EMAIL_RE.test(s);

/** Accepts `a@b.co` or `Name <a@b.co>`; refuses anything with line breaks or extra addresses. */
export function isFromAddress(s: string): boolean {
  if (isEmailAddress(s)) return true;
  const m = /^([^<>"\r\n,;]{1,60}) <([^<>\s]+)>$/.exec(s);
  return !!m && isEmailAddress(m[2] ?? '');
}

export function validateRecipients(list: readonly string[]): { ok: string[]; bad: string[] } {
  const ok: string[] = [];
  const bad: string[] = [];
  for (const raw of list) {
    const a = raw.trim();
    if (isEmailAddress(a)) ok.push(a);
    else bad.push(a);
  }
  return { ok, bad };
}

export interface EmailConfig {
  readonly smtpUrl: string;
  readonly from: string;
  readonly to: readonly string[];
}

export interface EmailDeps extends HttpDeps {
  /** For tests: nodemailer's jsonTransport, so nothing leaves the machine. */
  readonly transport?: Transporter;
}

/** Short, safe reasons from nodemailer's error codes. The SMTP URL carries a password, so the message is never used. */
export function emailReason(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code === 'EAUTH') return 'The mail server refused the login.';
  if (code === 'EENVELOPE') return 'The mail server refused a recipient or the sender.';
  if (['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'EDNS', 'ENOTFOUND', 'ETLS'].includes(code)) return 'Could not reach the mail server.';
  return 'The email could not be sent.';
}

export function emailSender(cfg: EmailConfig, deps: EmailDeps = {}): Sender {
  return {
    channel: 'email',
    async send(report: Report): Promise<DeliveryResult> {
      const fail = (reason: string): DeliveryResult => ({ channel: 'email', ok: false, reason });
      if (!/^smtps?:\/\//i.test(cfg.smtpUrl)) return fail('The saved mail server address must start with smtp:// or smtps://.');
      if (!isFromAddress(cfg.from)) return fail('The saved sender address is not valid.');
      const { ok: to, bad } = validateRecipients(cfg.to);
      if (to.length === 0) return fail('No valid recipients are set.');
      if (bad.length > 0) return fail('Some recipient addresses are not valid.');
      try {
        const transport = deps.transport ?? nodemailer.createTransport(cfg.smtpUrl, { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
        await transport.sendMail({ from: cfg.from, to, subject: clean(report.subject, 200), text: toPlainText(report, deps.dashboardUrl), html: toHtml(report, deps.dashboardUrl) });
        return { channel: 'email', ok: true, reason: 'Delivered' };
      } catch (e) {
        return fail(emailReason(e));
      }
    },
  };
}
