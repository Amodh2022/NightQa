import { describe, expect, it } from 'vitest';
import { dayKey, formatClock, formatDuration, formatUsd, hostLabel, longDay, plural, relativeDay, shortStamp } from './format';

describe('format', () => {
  it('formats durations, cost and plurals', () => {
    expect(formatDuration(6)).toBe('6s');
    expect(formatDuration(108)).toBe('1m 48s');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(65.4)).toBe('1m 05s');
    expect(formatUsd(0.314)).toBe('$0.31');
    expect(plural(1, 'bug')).toBe('1 bug');
    expect(plural(3, 'bug')).toBe('3 bugs');
  });
  it('formats dates the way the design shows them', () => {
    const d = new Date(2026, 9, 22, 2, 14);
    expect(formatClock(d)).toBe('02:14');
    expect(longDay(d)).toBe('Thursday 22 October');
    expect(shortStamp(d)).toBe('Thu 22 Oct, 02:14');
    expect(dayKey(d)).toBe('2026-10-22');
    expect(relativeDay(d, new Date(2026, 9, 22, 9))).toBe('Today · Thursday 22 October');
    expect(relativeDay(d, new Date(2026, 9, 23, 9))).toBe('Yesterday · Thursday 22 October');
    expect(relativeDay(d, new Date(2026, 9, 29, 9))).toBe('Thursday 22 October');
  });
  it('shortens the app host', () => {
    expect(hostLabel('http://127.0.0.1:4010')).toBe('127.0.0.1:4010');
    expect(hostLabel('not a url')).toBe('not a url');
  });
});
