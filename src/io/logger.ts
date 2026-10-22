import pino from 'pino';
import type { DestinationStream } from 'pino';
import { redactDeep } from '../core/redact.js';
import type { Log } from '../core/ports.js';

/**
 * Structured JSON logger with one correlation id (the run id) on every line.
 * Known secret values are scrubbed from every field, and common secret field names are removed by config.
 */
export function createRunLogger(
  runId: string,
  secrets: readonly string[],
  destination?: DestinationStream,
): Log {
  const logger = pino(
    {
      level: process.env.NIGHTQA_LOG_LEVEL ?? 'info',
      base: { runId },
      redact: {
        paths: ['*.password', '*.apiKey', '*.token', 'password', 'apiKey', 'token'],
        censor: '[REDACTED]',
      },
      formatters: { log: (obj) => redactDeep(obj, secrets) },
    },
    destination ?? pino.destination({ dest: 2, sync: true }),
  );
  return {
    info: (f, m) => {
      logger.info(f, m);
    },
    warn: (f, m) => {
      logger.warn(f, m);
    },
    error: (f, m) => {
      logger.error(f, m);
    },
  };
}
