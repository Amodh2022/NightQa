import { describe, expect, it } from 'vitest';
import { decideDue, localClock, previousDate, slotDue, type ScheduleSettings } from './schedule';

const base: ScheduleSettings = { nightlyEnabled: true, nightlyTime: '02:00', timezone: 'Asia/Kolkata', morningReportTime: '08:00' };
const at = (iso: string): Date => new Date(iso);

describe('localClock', () => {
  it('reads the wall clock in the schedule timezone', () => {
    expect(localClock(at('2026-10-21T20:30:00Z'), 'Asia/Kolkata')).toEqual({ date: '2026-10-22', minutes: 2 * 60 });
    expect(localClock(at('2026-10-21T20:30:00Z'), 'America/Los_Angeles')).toEqual({ date: '2026-10-21', minutes: 13 * 60 + 30 });
  });
  it('never reports hour 24 at midnight', () => {
    expect(localClock(at('2026-10-21T18:30:00Z'), 'Asia/Kolkata').minutes).toBe(0);
  });
});

describe('previousDate', () => {
  it('crosses month and year ends', () => {
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
    expect(previousDate('2026-01-01')).toBe('2025-12-31');
    expect(previousDate('2028-03-01')).toBe('2028-02-29');
  });
});

describe('decideDue', () => {
  it('is not due before the time', () => {
    expect(decideDue(at('2026-10-21T20:29:00Z'), base, {}).dueNightly).toBe(false);
  });
  it('is due at the time, in local time not UTC', () => {
    const d = decideDue(at('2026-10-21T20:30:00Z'), base, {});
    expect(d.dueNightly).toBe(true);
    expect(d.nightlyDate).toBe('2026-10-22');
  });
  it('fires once per local day', () => {
    const state = { lastNightlyDate: '2026-10-22' };
    expect(decideDue(at('2026-10-21T20:31:00Z'), base, state).dueNightly).toBe(false);
    expect(decideDue(at('2026-10-21T21:30:00Z'), base, state).dueNightly).toBe(false);
  });
  it('catches up a missed tick shortly after the time, but not hours later', () => {
    expect(decideDue(at('2026-10-21T21:30:00Z'), base, {}).dueNightly).toBe(true); // 03:00 local
    expect(decideDue(at('2026-10-22T06:00:00Z'), base, {}).dueNightly).toBe(false); // 11:30 local
  });
  it('runs again the next day', () => {
    expect(decideDue(at('2026-10-22T20:30:00Z'), base, { lastNightlyDate: '2026-10-22' }).dueNightly).toBe(true);
  });
  it('does nothing when the nightly run is off', () => {
    expect(decideDue(at('2026-10-21T20:30:00Z'), { ...base, nightlyEnabled: false }, {}).dueNightly).toBe(false);
  });
  it('still decides the report when the nightly run is off', () => {
    expect(decideDue(at('2026-10-22T02:30:00Z'), { ...base, nightlyEnabled: false }, {}).dueMorningReport).toBe(true);
  });
  it('tracks the report separately from the nightly run', () => {
    const d = decideDue(at('2026-10-22T02:30:00Z'), base, { lastNightlyDate: '2026-10-22' });
    expect(d.dueNightly).toBe(false);
    expect(d.dueMorningReport).toBe(true);
    expect(decideDue(at('2026-10-22T02:30:00Z'), base, { lastReportDate: '2026-10-22' }).dueMorningReport).toBe(false);
  });
  it('a slot before midnight still belongs to its own day after midnight', () => {
    const s = { ...base, nightlyTime: '23:30', timezone: 'UTC' };
    const d = decideDue(at('2026-10-22T00:20:00Z'), s, {});
    expect(d.dueNightly).toBe(true);
    expect(d.nightlyDate).toBe('2026-10-21');
    expect(decideDue(at('2026-10-22T00:20:00Z'), s, { lastNightlyDate: '2026-10-21' }).dueNightly).toBe(false);
  });
  it('falls back to UTC for an unknown timezone instead of throwing', () => {
    const s = { ...base, timezone: 'Mars/Base' };
    expect(() => decideDue(at('2026-10-22T02:00:00Z'), s, {})).not.toThrow();
    expect(decideDue(at('2026-10-22T02:00:00Z'), s, {}).dueNightly).toBe(true);
  });
  it('ignores a malformed time', () => {
    expect(decideDue(at('2026-10-22T02:00:00Z'), { ...base, nightlyTime: '2am', timezone: 'UTC' }, {}).dueNightly).toBe(false);
  });
});

describe('daylight saving time', () => {
  const ny: ScheduleSettings = { ...base, timezone: 'America/New_York', nightlyTime: '02:30' };
  it('runs a time that does not exist (spring forward) once the clock jumps past it', () => {
    // 2026-03-08: 02:00 EST jumps to 03:00 EDT, so 02:30 never happens
    expect(decideDue(at('2026-03-08T06:59:00Z'), ny, {}).dueNightly).toBe(false); // 01:59 EST
    const after = decideDue(at('2026-03-08T07:00:00Z'), ny, {}); // 03:00 EDT
    expect(after.dueNightly).toBe(true);
    expect(after.nightlyDate).toBe('2026-03-08');
  });
  it('runs a repeated time (fall back) only once', () => {
    const s = { ...ny, nightlyTime: '01:30' };
    const first = decideDue(at('2026-11-01T05:30:00Z'), s, {}); // 01:30 EDT
    expect(first.dueNightly).toBe(true);
    const second = decideDue(at('2026-11-01T06:30:00Z'), s, { lastNightlyDate: first.nightlyDate }); // 01:30 EST
    expect(second.dueNightly).toBe(false);
  });
});

describe('slotDue', () => {
  it('is never due with the exact same date recorded', () => {
    expect(slotDue({ date: '2026-10-22', minutes: 130 }, '02:00', '2026-10-22', 180).due).toBe(false);
  });
});
