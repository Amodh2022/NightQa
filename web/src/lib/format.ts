import type { Verdict } from './results';

const ACCENT = '#34E3CB';
export const COLORS = { accent: ACCENT, coral: '#FF6B5B', amber: '#FFC14D', violet: '#8B7CFF', blue: '#6AA6FF', grey: '#8E9BB2' } as const;

export interface VerdictMeta {
  readonly label: string;
  /** Solid color for dots and bars. */
  readonly color: string;
  /** Text color for chips (checked for contrast on the dark card). */
  readonly fg: string;
  readonly bg: string;
}

/** Labels and colors per verdict, taken from the design's chip system. */
export const VERDICTS: Record<Verdict, VerdictMeta> = {
  pass: { label: 'Pass', color: ACCENT, fg: ACCENT, bg: 'rgba(52,227,203,0.13)' },
  bug: { label: 'Bug', color: COLORS.coral, fg: '#FF8A7B', bg: 'rgba(255,107,91,0.18)' },
  app_changed: { label: 'App changed', color: COLORS.blue, fg: '#8DB8FF', bg: 'rgba(106,166,255,0.18)' },
  needs_setup: { label: 'Needs setup', color: COLORS.violet, fg: '#B9A6FF', bg: 'rgba(139,124,255,0.2)' },
  agent_stuck: { label: 'Agent stuck', color: COLORS.grey, fg: '#B4BFD2', bg: 'rgba(142,155,178,0.2)' },
};

export const VERDICT_ORDER: readonly Verdict[] = ['pass', 'bug', 'app_changed', 'needs_setup', 'agent_stuck'];

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${String(s)}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${String(m)}m` : `${String(m)}m ${String(r).padStart(2, '0')}s`;
}

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const dayKey = (d: Date): string => `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "Thursday 22 October". */
export function longDay(d: Date): string {
  return `${DAYS[d.getDay()] ?? ''} ${String(d.getDate())} ${MONTHS[d.getMonth()] ?? ''}`;
}

/** "Thu 22 Oct, 02:14". */
export function shortStamp(d: Date): string {
  return `${(DAYS[d.getDay()] ?? '').slice(0, 3)} ${String(d.getDate())} ${(MONTHS[d.getMonth()] ?? '').slice(0, 3)}, ${formatClock(d)}`;
}

/** "Today", "Yesterday" or the long day, relative to `now`. */
export function relativeDay(d: Date, now: Date = new Date()): string {
  const diff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000);
  if (diff === 0) return `Today · ${longDay(d)}`;
  if (diff === 1) return `Yesterday · ${longDay(d)}`;
  return longDay(d);
}

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Short hostname of the app under test, for the top bar. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}
