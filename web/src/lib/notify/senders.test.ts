import nodemailer from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import type { Report } from '../report';
import { escapeHtml, slackSafe, toHtml, toPlainText, toSlackText, toWebhookBody } from './format';
import { backoffMs, postJson } from './http';
import { emailSender, isEmailAddress, isFromAddress, slackSender, validateRecipients, webhookSender } from './senders';

const evil = '<script>alert(1)</script> <!channel> <@U123> @here *bold* `code` [x](http://e.vil) a|b\nSECOND LINE';

const report: Report = {
  kind: 'report',
  subject: `ShopKart · 1 new bug confirmed`,
  summary: ['1 of 2 flows passed · 22 Oct'],
  items: [{ tag: 'HIGH', tone: 'high', title: evil, refs: 'Issue #1 · PR #2', url: 'https://github.com/o/r/pull/2', bugId: 'bug-aaaaaaaaaaaa', runId: 'r1' }],
  notes: ['PR #138 was merged.'],
  counts: { flowsPassed: 1, flowsTotal: 2, newBugs: 1, fixPrsReady: 1, prsMerged: 1, needsSetup: 0, needsLook: 0 },
  dateLabel: '22 Oct',
  headline: ['1 bug proven.', '1 fix waiting.'],
  send: true,
};

const publicResolve = (): Promise<string[]> => Promise.resolve(['93.184.216.34']);
const URL_SLACK = 'https://hooks.slack.com/services/T000/B000/SECRETSECRET';
const noSleep = (): Promise<void> => Promise.resolve();
const res = (status: number, headers: Record<string, string> = {}): Response => new Response('body that must never be echoed', { status, headers });

describe('format: untrusted text', () => {
  it('escapes HTML in emails', () => {
    const html = toHtml(report);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(escapeHtml(`"'<>&`)).toBe('&quot;&#39;&lt;&gt;&amp;');
  });
  it('neutralizes Slack mentions, links and formatting', () => {
    const s = slackSafe(evil);
    expect(s).not.toMatch(/<|>/);
    expect(s).not.toContain('@here');
    expect(s).not.toMatch(/[*`|]/);
    expect(s).not.toContain('\n');
    const text = toSlackText(report, 'https://dash.example.com');
    expect(text).not.toContain('<!channel>');
    expect(text).toContain('<https://github.com/o/r/pull/2|');
    expect(text).toContain('<https://dash.example.com|Open dashboard>');
  });
  it('keeps plain text and the webhook body on one line per field', () => {
    expect(toPlainText(report)).not.toContain('SECOND LINE\n');
    const body = toWebhookBody(report);
    expect(JSON.stringify(body)).not.toContain('\\nSECOND');
    expect(body.event).toBe('morning_report');
  });
  it('drops a dashboard link that is not http(s)', () => {
    expect(toPlainText(report, 'javascript:alert(1)')).not.toContain('javascript');
  });
});

describe('postJson', () => {
  it('delivers on 2xx', async () => {
    const f = vi.fn().mockResolvedValue(res(200));
    expect(await postJson(URL_SLACK, { a: 1 }, { allowedHosts: ['hooks.slack.com'] }, { fetchImpl: f, resolve: publicResolve, sleep: noSleep })).toEqual({ ok: true, reason: 'Delivered' });
    expect(f).toHaveBeenCalledTimes(1);
    const init = f.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.body).toBe('{"a":1}');
  });
  it('retries 429 and 5xx with backoff, then succeeds', async () => {
    const f = vi.fn().mockResolvedValueOnce(res(429, { 'retry-after': '2' })).mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    const sleep = vi.fn((ms: number) => Promise.resolve(ms).then(() => undefined));
    const r = await postJson('https://example.com/h', {}, {}, { fetchImpl: f, resolve: publicResolve, sleep, random: () => 1 });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls[0]?.[0]).toBe(2000); // Retry-After wins over the 500 ms backoff
    expect(sleep.mock.calls[1]?.[0]).toBe(1000);
  });
  it('gives up after the attempts and does not leak the URL or the body', async () => {
    const f = vi.fn().mockResolvedValue(res(500));
    const r = await postJson(URL_SLACK, {}, {}, { fetchImpl: f, resolve: publicResolve, sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(r)).not.toContain('SECRETSECRET');
    expect(JSON.stringify(r)).not.toContain('must never be echoed');
  });
  it('does not retry a 4xx', async () => {
    const f = vi.fn().mockResolvedValue(res(404));
    const r = await postJson('https://example.com/h', {}, {}, { fetchImpl: f, resolve: publicResolve, sleep: noSleep });
    expect(r).toEqual({ ok: false, reason: 'The server answered HTTP 404.' });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('treats network errors and timeouts as retryable and reports them safely', async () => {
    const f = vi.fn().mockRejectedValue(new Error(`connect ECONNREFUSED ${URL_SLACK}`));
    const r = await postJson(URL_SLACK, {}, {}, { fetchImpl: f, resolve: publicResolve, sleep: noSleep });
    expect(r.reason).toBe('Could not reach the server.');
    expect(f).toHaveBeenCalledTimes(3);
    const t = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'TimeoutError' }));
    expect((await postJson('https://example.com/h', {}, {}, { fetchImpl: t, resolve: publicResolve, sleep: noSleep, maxAttempts: 1 })).reason).toBe('The request timed out.');
  });
  it('refuses redirects', async () => {
    const f = vi.fn().mockResolvedValue(res(302, { location: 'http://169.254.169.254/' }));
    const r = await postJson('https://example.com/h', {}, {}, { fetchImpl: f, resolve: publicResolve, sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('never calls fetch for a private target', async () => {
    const f = vi.fn();
    expect((await postJson('https://example.com/h', {}, {}, { fetchImpl: f, resolve: () => Promise.resolve(['10.0.0.1']), sleep: noSleep })).ok).toBe(false);
    expect((await postJson('http://example.com/h', {}, {}, { fetchImpl: f, sleep: noSleep })).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it('backoff grows, is capped and jittered', () => {
    expect(backoffMs(0, () => 1)).toBe(500);
    expect(backoffMs(3, () => 1)).toBe(4000);
    expect(backoffMs(10, () => 1)).toBe(8000);
    expect(backoffMs(2, () => 0)).toBe(0);
  });
});

describe('slack and webhook senders', () => {
  it('posts {text} to a Slack webhook', async () => {
    const f = vi.fn().mockResolvedValue(res(200));
    const r = await slackSender(URL_SLACK, { fetchImpl: f, resolve: publicResolve, sleep: noSleep }).send(report);
    expect(r).toEqual({ channel: 'slack', ok: true, reason: 'Delivered' });
    expect(JSON.parse((f.mock.calls[0]?.[1] as RequestInit).body as string)).toHaveProperty('text');
  });
  it('only accepts hooks.slack.com (and /services/) for Slack', async () => {
    const f = vi.fn();
    for (const u of ['https://example.com/services/x', 'https://hooks.slack.com.evil.io/services/x', 'https://hooks.slack.com/other', 'http://hooks.slack.com/services/x']) {
      const r = await slackSender(u, { fetchImpl: f, resolve: publicResolve, sleep: noSleep }).send(report);
      expect(r.ok, u).toBe(false);
    }
    expect(f).not.toHaveBeenCalled();
  });
  it('allows extra Slack-compatible hosts from the operator', async () => {
    const f = vi.fn().mockResolvedValue(res(200));
    const r = await slackSender('https://chat.example.org/hooks/abc', { fetchImpl: f, resolve: publicResolve, sleep: noSleep }, ['hooks.slack.com', 'chat.example.org']).send(report);
    expect(r.ok).toBe(true);
  });
  it('posts the JSON body to a generic webhook', async () => {
    const f = vi.fn().mockResolvedValue(res(202));
    const r = await webhookSender('https://example.com/nightqa', { fetchImpl: f, resolve: publicResolve, sleep: noSleep }).send(report);
    expect(r.ok).toBe(true);
    expect(JSON.parse((f.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({ source: 'nightqa', event: 'morning_report' });
  });
});

describe('email sender', () => {
  const cfg = { smtpUrl: 'smtps://user:pw@smtp.example.com:465', from: 'NightQA <nightqa@example.com>', to: ['a@example.com', 'b@example.com'] };
  it('sends plain text and escaped HTML through the transport', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(transport, 'sendMail');
    const r = await emailSender(cfg, { transport, dashboardUrl: 'https://dash.example.com' }).send(report);
    expect(r).toEqual({ channel: 'email', ok: true, reason: 'Delivered' });
    const sent = spy.mock.calls[0]?.[0] as { to: string[]; subject: string; text: string; html: string };
    expect(sent.to).toEqual(cfg.to);
    expect(sent.subject).toBe(report.subject);
    expect(sent.text).toContain('Open the full report: https://dash.example.com');
    expect(sent.html).not.toContain('<script>');
  });
  it('refuses bad recipients, bad sender and non-SMTP URLs without sending', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(transport, 'sendMail');
    expect((await emailSender({ ...cfg, to: [] }, { transport }).send(report)).ok).toBe(false);
    expect((await emailSender({ ...cfg, to: ['a@example.com', 'x@y.co\nBcc: evil@example.com'] }, { transport }).send(report)).ok).toBe(false);
    expect((await emailSender({ ...cfg, from: 'a@example.com\r\nBcc: x@y.co' }, { transport }).send(report)).ok).toBe(false);
    expect((await emailSender({ ...cfg, smtpUrl: 'http://x' }, { transport }).send(report)).ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
  it('reports a transport failure without the password or the server message', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    vi.spyOn(transport, 'sendMail').mockRejectedValue(Object.assign(new Error('Invalid login smtps://user:pw@smtp.example.com'), { code: 'EAUTH' }));
    const r = await emailSender(cfg, { transport }).send(report);
    expect(r).toEqual({ channel: 'email', ok: false, reason: 'The mail server refused the login.' });
    expect(JSON.stringify(r)).not.toContain('pw');
  });
  it('validates addresses', () => {
    expect(isEmailAddress('a@b.co')).toBe(true);
    expect(isEmailAddress('a@b')).toBe(false);
    expect(isEmailAddress('a b@c.co')).toBe(false);
    expect(isFromAddress('NightQA <n@example.com>')).toBe(true);
    expect(isFromAddress('n@example.com, x@y.co')).toBe(false);
    expect(validateRecipients(['a@b.co', 'nope'])).toEqual({ ok: ['a@b.co'], bad: ['nope'] });
  });
});
