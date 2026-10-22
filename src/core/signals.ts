import type { DriverSignal } from './ports.js';
import type { FindingKind } from './verdict.js';

const SIGNAL_TO_FINDING: Partial<Record<DriverSignal['kind'], FindingKind>> = {
  'page-error': 'js-error',
  'http-5xx': 'http-5xx',
  'page-not-found': 'dead-link',
  'console-error': 'console-error',
};

/**
 * Which finding, if any, a browser signal counts as. Policy signals (blocked or failed requests) are not bugs.
 * The browser also logs a console error for every failed resource; the network signal already covers it.
 */
export function findingKindFor(signal: DriverSignal): FindingKind | undefined {
  const kind = SIGNAL_TO_FINDING[signal.kind];
  if (kind === 'console-error' && /failed to load resource/i.test(signal.message)) return undefined;
  return kind;
}
