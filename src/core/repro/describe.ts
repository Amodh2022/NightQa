import { pathOf } from './fingerprint.js';
import type { BugCandidate } from './types.js';

const short = (s: string, n = 120): string => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

/** One-line issue title. */
export function titleFor(c: BugCandidate): string {
  const path = pathOf(c.finding.url) || '/';
  switch (c.finding.kind) {
    case 'expectation-failed':
      return short(`${c.flow}: ${c.expected ?? c.finding.message}`, 100);
    case 'js-error':
      return short(`JavaScript error on ${path}: ${c.finding.message}`, 100);
    case 'http-5xx':
      return `Server error on ${path}`;
    case 'dead-link':
      return `Page not found: ${path}`;
    case 'blank-page':
      return `Blank page at ${path}`;
    case 'spinner':
      return `Loading indicator never finishes at ${path}`;
    case 'console-error':
      return short(`Console error on ${path}: ${c.finding.message}`, 100);
  }
}

/** What should have happened (plain words). */
export function expectedFor(c: BugCandidate): string {
  if (c.expected) return c.expected;
  switch (c.finding.kind) {
    case 'blank-page':
      return 'The page shows content.';
    case 'spinner':
      return 'The page finishes loading.';
    case 'dead-link':
      return 'The link opens a real page.';
    default:
      return 'The page works with no errors.';
  }
}

/** What happened instead. */
export function actualFor(c: BugCandidate): string {
  return c.finding.message;
}
