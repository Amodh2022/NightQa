/** Pure schedule decisions: no clock, no files. Everything is given in, so it is easy to test. */

export interface ScheduleSettings {
  readonly nightlyEnabled: boolean;
  /** HH:MM, 24 hour, in `timezone`. */
  readonly nightlyTime: string;
  /** IANA name, for example Asia/Kolkata. */
  readonly timezone: string;
  readonly morningReportTime: string;
}

export interface SchedulerState {
  /** Local date (YYYY-MM-DD, in the schedule timezone) of the last nightly batch that was started. */
  readonly lastNightlyDate?: string | undefined;
  readonly lastReportDate?: string | undefined;
}

export interface Due {
  readonly dueNightly: boolean;
  readonly dueMorningReport: boolean;
  /** The local date the nightly slot belongs to (set even when not due). */
  readonly nightlyDate: string;
  readonly reportDate: string;
}

/** How long after the scheduled minute a missed slot may still run (a restart or a slow tick). */
export const NIGHTLY_CATCH_UP_MINUTES = 180;
export const REPORT_CATCH_UP_MINUTES = 360;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface LocalClock {
  /** YYYY-MM-DD in the timezone. */
  readonly date: string;
  /** Minutes since local midnight. */
  readonly minutes: number;
}

/** The wall clock in `timeZone` at `now`. */
export function localClock(now: Date, timeZone: string): LocalClock {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(now)) p[part.type] = part.value;
  return { date: `${p.year ?? '0000'}-${p.month ?? '00'}-${p.day ?? '00'}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function parseHhmm(s: string): number | undefined {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}

/** The date string for the day before `date` (calendar arithmetic only, so no DST involved). */
export function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1));
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/**
 * A slot is due when the local clock has reached its time, no more than `catchUp` minutes ago, and that local day has
 * not run it yet. A slot at 23:30 still belongs to the day it was scheduled for after midnight. Because the check
 * uses the wall clock, a time that does not exist (spring forward) runs when the clock jumps past it, and a time that
 * happens twice (fall back) still runs once, because the day is recorded.
 */
export function slotDue(clock: LocalClock, time: string, lastDate: string | undefined, catchUp: number): { due: boolean; date: string } {
  const at = parseHhmm(time);
  if (at === undefined) return { due: false, date: clock.date };
  const date = clock.minutes >= at ? clock.date : previousDate(clock.date);
  const since = (clock.minutes - at + 1440) % 1440;
  return { due: since < catchUp && lastDate !== date, date };
}

export function decideDue(now: Date, schedule: ScheduleSettings, state: SchedulerState): Due {
  const tz = isValidTimezone(schedule.timezone) ? schedule.timezone : 'UTC';
  const clock = localClock(now, tz);
  const nightly = slotDue(clock, schedule.nightlyTime, state.lastNightlyDate, NIGHTLY_CATCH_UP_MINUTES);
  const report = slotDue(clock, schedule.morningReportTime, state.lastReportDate, REPORT_CATCH_UP_MINUTES);
  return {
    dueNightly: schedule.nightlyEnabled && nightly.due,
    dueMorningReport: report.due,
    nightlyDate: nightly.date,
    reportDate: report.date,
  };
}
