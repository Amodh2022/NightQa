import { describe, expect, it } from 'vitest';
import type { BugRecord } from '../bugs';
import type { Delivery } from './log';
import { buildAlertFeed, listNames, minutesLabel, timeLabel, whenLabel, zoneLabel } from './view';

const now = new Date('2026-10-22T06:00:00Z');
const bug = (over: Partial<BugRecord>): BugRecord => ({
  version: 1, id: 'bug-aaaaaaaaaaaa', runId: 'r1', flow: 'Checkout', title: 'Payment cannot be completed', severity: 'critical', status: 'reported', statusNote: '', reproduced: 3, attempts: 3,
  recipe: [], expected: '', actual: '', evidence: [], createdAt: '2026-10-22T01:00:00Z', updatedAt: '2026-10-22T01:00:00Z', ...over,
});
const d = (over: Partial<Delivery>): Delivery => ({ at: '2026-10-22T01:06:00Z', channel: 'slack', kind: 'critical', ok: true, reason: 'Delivered', bugId: 'bug-aaaaaaaaaaaa', ...over });

describe('labels', () => {
  it('formats times', () => {
    expect(timeLabel('08:00')).toBe('8:00 AM');
    expect(timeLabel('00:05')).toBe('12:05 AM');
    expect(timeLabel('13:30')).toBe('1:30 PM');
    expect(zoneLabel('Asia/Kolkata', now)).toMatch(/IST|GMT\+5:30/);
    expect(zoneLabel('Nope/Zone', now)).toBe('Nope/Zone');
    expect(minutesLabel(6)).toBe('6 min');
    expect(minutesLabel(0.2)).toBe('under a minute');
    expect(minutesLabel(300)).toBe('5 h');
    expect(listNames(['Slack', 'email'])).toBe('Slack and email');
    expect(listNames(['a', 'b', 'c'])).toBe('a, b and c');
  });
  it('says today, yesterday or the weekday in the report timezone', () => {
    expect(whenLabel(new Date('2026-10-22T03:14:00Z'), now, 'UTC')).toBe('Today, 03:14');
    expect(whenLabel(new Date('2026-10-21T03:14:00Z'), now, 'UTC')).toBe('Yesterday, 03:14');
    expect(whenLabel(new Date('2026-10-19T03:14:00Z'), now, 'UTC')).toBe('Monday, 03:14');
  });
});

describe('buildAlertFeed', () => {
  it('is empty with no data', () => {
    expect(buildAlertFeed({ bugs: [], deliveries: [], now })).toEqual({ earlier: [] });
  });
  it('shows the newest open critical bug and when it was sent', () => {
    const f = buildAlertFeed({ bugs: [bug({})], deliveries: [d({})], now });
    expect(f.critical?.bug.title).toBe('Payment cannot be completed');
    expect(f.critical?.sentLabel).toBe('Sent 6 min after it was confirmed');
  });
  it('says plainly when nothing was sent, or sending failed', () => {
    expect(buildAlertFeed({ bugs: [bug({})], deliveries: [], now }).critical?.sentLabel).toBe('Not sent: no channel is on');
    expect(buildAlertFeed({ bugs: [bug({})], deliveries: [d({ ok: false })], now }).critical?.sentLabel).toBe('Could not be sent');
  });
  it('does not show a fixed or old critical bug', () => {
    expect(buildAlertFeed({ bugs: [bug({ pull: { number: 9, url: 'https://github.com/o/r/pull/9', state: 'merged' } })], deliveries: [], now }).critical).toBeUndefined();
    expect(buildAlertFeed({ bugs: [bug({ createdAt: '2026-08-01T00:00:00Z' })], deliveries: [], now }).critical).toBeUndefined();
  });
  it('lists real events newest first and groups channels', () => {
    const bugs = [
      bug({}),
      bug({ id: 'bug-bbbbbbbbbbbb', severity: 'high', title: 'Coupon', createdAt: '2026-10-21T22:00:00Z' }),
      bug({ id: 'bug-cccccccccccc', severity: 'medium', title: 'Merged one', updatedAt: '2026-10-20T10:00:00Z', pull: { number: 138, url: 'https://github.com/o/r/pull/138', state: 'merged' } }),
    ];
    const deliveries = [d({ kind: 'morning', bugId: undefined, at: '2026-10-22T02:30:00Z' }), d({ kind: 'morning', bugId: undefined, channel: 'email', at: '2026-10-22T02:30:10Z' }), d({ kind: 'test', at: '2026-10-22T03:00:00Z' })];
    const f = buildAlertFeed({ bugs, deliveries, now });
    expect(f.earlier.map((e) => e.title)).toEqual(['Morning report sent to Slack and email', 'High bug proven: Coupon', 'PR #138 was merged: Merged one']);
  });
  it('keeps untrusted titles on one line', () => {
    const f = buildAlertFeed({ bugs: [bug({ id: 'bug-bbbbbbbbbbbb', severity: 'high', title: 'a\nb' })], deliveries: [], now });
    expect(f.earlier[0]?.title).toBe('High bug proven: a b');
  });
});
