import { columnOf, latestPerBug, type BugRecord } from '../bugs';
import { clean } from '../report';
import { localClock, previousDate } from '../schedule';
import type { Delivery } from './log';

/** Pure helpers behind the notification screens: labels and the alert feed. */

/** "08:00" -> "8:00 AM". */
export function timeLabel(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${String(h % 12 === 0 ? 12 : h % 12)}:${m[2] ?? '00'} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "IST", "GMT+5:30" ... the short zone name at `now`, or the IANA name when there is none. */
export function zoneLabel(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function clock(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

/** "Today, 02:44", "Yesterday, 08:00" or "Wednesday, 08:00". */
export function whenLabel(d: Date, now: Date, timeZone: string): string {
  const day = localClock(d, timeZone).date;
  const today = localClock(now, timeZone).date;
  const at = clock(d, timeZone);
  if (day === today) return `Today, ${at}`;
  if (day === previousDate(today)) return `Yesterday, ${at}`;
  let weekday = '';
  try {
    weekday = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' }).format(d);
  } catch {
    weekday = day;
  }
  return `${weekday}, ${at}`;
}

export function minutesLabel(min: number): string {
  if (min < 1) return 'under a minute';
  if (min < 120) return `${String(Math.round(min))} min`;
  return `${String(Math.round(min / 60))} h`;
}

const CHANNEL_NAME = { email: 'email', slack: 'Slack', webhook: 'webhook' } as const;

export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

export type FeedColor = 'accent' | 'white' | 'violet' | 'blue' | 'coral' | 'amber';

export interface FeedItem {
  readonly title: string;
  readonly at: Date;
  readonly color: FeedColor;
}

export interface CriticalCard {
  readonly bug: BugRecord;
  /** "Sent 6 min after it was confirmed", or why it was not sent. */
  readonly sentLabel: string;
}

export interface AlertFeed {
  readonly critical?: CriticalCard;
  readonly earlier: readonly FeedItem[];
}

const WEEK = 7 * 24 * 3_600_000;

/** Groups deliveries of the same kind within ten minutes into one feed line ("sent to Slack and email"). */
function deliveryItems(deliveries: readonly Delivery[]): FeedItem[] {
  const out: FeedItem[] = [];
  const groups = new Map<string, Delivery[]>();
  for (const d of deliveries) {
    if (d.kind === 'test') continue;
    const bucket = Math.floor(new Date(d.at).getTime() / 600_000);
    const key = `${d.kind}:${d.bugId ?? ''}:${String(bucket)}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  for (const g of groups.values()) {
    const first = g[0];
    if (!first) continue;
    const okNames = g.filter((d) => d.ok).map((d) => CHANNEL_NAME[d.channel]);
    const badNames = g.filter((d) => !d.ok).map((d) => CHANNEL_NAME[d.channel]);
    const what = first.kind === 'critical' ? 'Critical alert' : 'Morning report';
    const at = new Date(first.at);
    if (okNames.length > 0) out.push({ title: `${what} sent to ${listNames(okNames)}`, at, color: 'white' });
    if (badNames.length > 0) out.push({ title: `${what} could not be sent to ${listNames(badNames)}`, at, color: 'coral' });
  }
  return out;
}

/** The alert feed, from real bug records and the delivery log only. */
export function buildAlertFeed(input: { bugs: readonly BugRecord[]; deliveries: readonly Delivery[]; now: Date; maxEarlier?: number }): AlertFeed {
  const { bugs, deliveries, now } = input;
  const latest = latestPerBug(bugs);
  const recent = (iso: string): boolean => now.getTime() - new Date(iso).getTime() < WEEK;

  const criticals = latest
    .filter((b) => b.severity === 'critical' && (b.status === 'reported' || b.status === 'ready') && columnOf(b) !== 'fixed' && recent(b.createdAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const top = criticals[0];
  let critical: CriticalCard | undefined;
  if (top) {
    const sent = deliveries.filter((d) => d.kind === 'critical' && d.bugId === top.id);
    const ok = sent.filter((d) => d.ok).sort((a, b) => a.at.localeCompare(b.at))[0];
    const sentLabel = ok
      ? `Sent ${minutesLabel(Math.max(0, (new Date(ok.at).getTime() - new Date(top.createdAt).getTime()) / 60_000))} after it was confirmed`
      : sent.length > 0
        ? 'Could not be sent'
        : 'Not sent: no channel is on';
    critical = { bug: top, sentLabel };
  }

  const items: FeedItem[] = [];
  for (const b of latest) {
    if (b.id === top?.id) continue;
    if (b.pull?.state === 'merged' && recent(b.updatedAt)) items.push({ title: `PR #${String(b.pull.number)} was merged: ${clean(b.title, 90)}`, at: new Date(b.updatedAt), color: 'blue' });
    else if (b.pull?.state === 'open' && recent(b.updatedAt)) items.push({ title: `Fix PR #${String(b.pull.number)} is ready to review: ${clean(b.title, 90)}`, at: new Date(b.updatedAt), color: 'accent' });
    else if ((b.severity === 'critical' || b.severity === 'high') && (b.status === 'reported' || b.status === 'ready') && recent(b.createdAt)) {
      items.push({ title: `${b.severity === 'critical' ? 'Critical' : 'High'} bug proven: ${clean(b.title, 90)}`, at: new Date(b.createdAt), color: b.severity === 'critical' ? 'coral' : 'amber' });
    }
  }
  items.push(...deliveryItems(deliveries.filter((d) => recent(d.at))));
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return { ...(critical ? { critical } : {}), earlier: items.slice(0, input.maxEarlier ?? 8) };
}
