import { createHash } from 'node:crypto';
import type { Finding } from '../verdict.js';

/** Path part of a URL, or the text itself when it is not a URL. */
export function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

/** Makes messages from different nights comparable: no query strings, digits or long ids. */
export function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/https?:\/\/[^\s"')]+/g, (u) => pathOf(u))
    .replace(/\?[^\s"')]*/g, '')
    .replace(/\b[0-9a-f]{8,}\b/g, '#')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identity of a browser-detected problem: what happened, and on which page. */
export function findingKey(f: Pick<Finding, 'kind' | 'message' | 'url'>): string {
  const detail =
    f.kind === 'blank-page' || f.kind === 'spinner' || f.kind === 'expectation-failed'
      ? ''
      : normalizeMessage(f.message);
  return `${f.kind}|${pathOf(f.url)}|${detail}`;
}

/**
 * Stable bug id. For a failed expectation it uses the flow and the expectation text (the AI's wording of
 * the evidence changes every night); for everything else, the problem and the page.
 */
export function bugId(f: Finding, flow: string, expected: string | undefined): string {
  const basis =
    f.kind === 'expectation-failed'
      ? `${flow}|${String(f.stepIndex)}|${normalizeMessage(expected ?? f.message)}`
      : findingKey(f);
  return `bug-${createHash('sha256').update(basis).digest('hex').slice(0, 12)}`;
}
