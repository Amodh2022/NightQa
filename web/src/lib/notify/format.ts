import { clean, type Report, type ReportItem } from '../report';

/**
 * Turns a report into the text each channel sends. Titles and flow names come from a page under test or from an AI,
 * so they are untrusted: each renderer neutralizes what its channel would interpret (HTML, Slack markup, mentions).
 */

const ZWSP = String.fromCharCode(0x200b);

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Slack: entities for & < > (which also defuses <!channel>, <@U123> and link syntax), no formatting characters, no @-mentions. */
export function slackSafe(s: string): string {
  return clean(s, 200)
    .replace(/[*_~`|]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@/g, `@${ZWSP}`);
}

/** Plain text: one line, no control characters. */
export const plainSafe = (s: string): string => clean(s, 200);

export function safeDashboardUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.origin + (p.pathname === '/' ? '' : p.pathname.replace(/\/$/, '')) : undefined;
  } catch {
    return undefined;
  }
}

const itemLine = (i: ReportItem): string => `${i.tag}  ${plainSafe(i.title)} (${plainSafe(i.refs)})`;

export function toPlainText(r: Report, dashboardUrl?: string): string {
  const dash = safeDashboardUrl(dashboardUrl);
  const lines = [plainSafe(r.subject), '', ...r.summary.map(plainSafe)];
  if (r.items.length > 0) lines.push('', ...r.items.map((i) => `- ${itemLine(i)}${i.url ? `\n  ${i.url}` : ''}`));
  if (r.notes.length > 0) lines.push('', ...r.notes.map(plainSafe));
  if (dash) lines.push('', `Open the full report: ${dash}`);
  lines.push('', '-- NightQA');
  return lines.join('\n');
}

const CHIP: Record<string, { fg: string; bg: string }> = {
  crit: { fg: '#ffffff', bg: '#d6402f' },
  high: { fg: '#b3261e', bg: '#fde3df' },
  med: { fg: '#8a5a00', bg: '#fff0d1' },
  low: { fg: '#335c9e', bg: '#e1ecfb' },
  setup: { fg: '#5b3fc4', bg: '#ebe6fb' },
  look: { fg: '#4a5568', bg: '#e8ecf2' },
};

export function toHtml(r: Report, dashboardUrl?: string): string {
  const dash = safeDashboardUrl(dashboardUrl);
  const rows = r.items
    .map((i) => {
      const c = CHIP[i.tone] ?? CHIP.look;
      const title = i.url ? `<a href="${escapeHtml(i.url)}" style="color:#0b1019">${escapeHtml(plainSafe(i.title))}</a>` : escapeHtml(plainSafe(i.title));
      return `<tr><td style="padding:10px 12px 10px 0;vertical-align:top"><span style="display:inline-block;font:700 11px Arial,sans-serif;color:${c?.fg ?? '#000'};background:${c?.bg ?? '#eee'};padding:4px 9px;border-radius:99px">${escapeHtml(i.tag)}</span></td><td style="padding:10px 0;vertical-align:top"><div style="font:700 14px Arial,sans-serif;color:#0b1019">${title}</div><div style="font:12.5px Arial,sans-serif;color:#5b6678;margin-top:3px">${escapeHtml(plainSafe(i.refs))}</div></td></tr>`;
    })
    .join('');
  return [
    '<!doctype html><html><body style="margin:0;padding:24px;background:#f4f6fa">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:24px;font-family:Arial,sans-serif">',
    `<div style="font:700 17px Arial,sans-serif;color:#0b1019;line-height:1.3">${escapeHtml(plainSafe(r.subject))}</div>`,
    ...r.summary.map((s) => `<div style="font:14px Arial,sans-serif;color:#3b4557;margin-top:10px;line-height:1.5">${escapeHtml(plainSafe(s))}</div>`),
    rows ? `<table role="presentation" style="border-collapse:collapse;margin-top:12px;width:100%">${rows}</table>` : '',
    ...r.notes.map((n) => `<div style="font:13px Arial,sans-serif;color:#5b6678;margin-top:10px">${escapeHtml(plainSafe(n))}</div>`),
    dash ? `<div style="margin-top:18px"><a href="${escapeHtml(dash)}" style="display:inline-block;background:#34e3cb;color:#03211d;font:700 14px Arial,sans-serif;padding:12px 20px;border-radius:10px;text-decoration:none">Open the full report</a></div>` : '',
    '<div style="font:12px Arial,sans-serif;color:#8a94a6;margin-top:20px">Sent by NightQA</div>',
    '</div></body></html>',
  ].join('');
}

const SLACK_TAG: Record<string, string> = { crit: 'CRITICAL', high: 'HIGH', med: 'MED', low: 'LOW', setup: 'Needs setup:', look: 'Needs a look:' };

/** Slack mrkdwn in the layout of the design: bold headline, summary, one line per item. */
export function toSlackText(r: Report, dashboardUrl?: string): string {
  const dash = safeDashboardUrl(dashboardUrl);
  const lines = [`*${slackSafe(r.subject)}*`, ...r.summary.map(slackSafe)];
  for (const i of r.items) {
    const title = i.url && /^https:\/\/github\.com\/[\w./-]+$/.test(i.url) ? `<${i.url}|${slackSafe(i.title)}>` : slackSafe(i.title);
    lines.push(`*${SLACK_TAG[i.tone] ?? i.tag}* ${title} → ${slackSafe(i.refs)}`);
  }
  lines.push(...r.notes.map(slackSafe));
  if (dash) lines.push(`<${dash}|Open dashboard>`);
  return lines.join('\n');
}

/** The JSON a generic webhook receives. Plain strings only; the receiver decides how to render them. */
export function toWebhookBody(r: Report, dashboardUrl?: string): Record<string, unknown> {
  const dash = safeDashboardUrl(dashboardUrl);
  return {
    source: 'nightqa',
    event: r.kind === 'critical' ? 'critical_bug' : r.kind === 'test' ? 'test' : 'morning_report',
    subject: plainSafe(r.subject),
    summary: r.summary.map(plainSafe),
    counts: r.counts,
    items: r.items.map((i) => ({ severity: i.tag, title: plainSafe(i.title), refs: plainSafe(i.refs), ...(i.url ? { url: i.url } : {}) })),
    notes: r.notes.map(plainSafe),
    ...(dash ? { dashboard: dash } : {}),
    text: toPlainText(r, dashboardUrl),
  };
}
