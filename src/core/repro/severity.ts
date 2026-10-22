import type { BugCandidate, Severity } from './types.js';

const PAYMENT = /\b(pay(ment|ing)?|checkout|card|upi|purchase|billing|buy)\b/i;
const LOGIN = /\b(log ?in|sign ?in|sign ?up|otp|password|auth)/i;
const BLOCKED =
  /\b(disabled|cannot|can't|can not|unable|blocked|fail(s|ed)?|stuck|impossible|never|won't)\b/i;

/**
 * PRD severity: Critical = login or payment can't be completed; High = a feature is broken but the app works;
 * Medium = an error shows, there is a workaround; Low = a console error with no visible effect.
 */
export function rateSeverity(c: BugCandidate): Severity {
  const { kind } = c.finding;
  if (kind === 'console-error') return 'low';
  const failingStep = c.steps[c.finding.stepIndex] ?? '';
  const text = [c.finding.message, c.proof?.statement ?? '', failingStep, c.expected ?? ''].join(
    ' ',
  );
  const blocksMoney = PAYMENT.test(text) || LOGIN.test(text);
  if (blocksMoney && BLOCKED.test(text)) return 'critical';
  if (kind === 'expectation-failed' || kind === 'http-5xx') return 'high';
  return 'medium';
}

const ORDER: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** True when `s` is at or above the team's chosen minimum level. */
export function atLeast(s: Severity, min: Severity): boolean {
  return ORDER[s] >= ORDER[min];
}
