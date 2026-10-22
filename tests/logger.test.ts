import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createRunLogger } from '../src/io/logger.js';

describe('createRunLogger', () => {
  it('writes JSON with the run id and scrubs secrets and secret-named fields', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString('utf8'));
        cb();
      },
    });
    const log = createRunLogger('RUN123', ['s3cr3t-value'], sink);
    log.info(
      { event: 'x', note: 'typed s3cr3t-value here', creds: { password: 'p', token: 't' } },
      'hello',
    );
    const out = lines.join('');
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.runId).toBe('RUN123');
    expect(out).not.toContain('s3cr3t-value');
    expect(parsed.creds).toEqual({ password: '[REDACTED]', token: '[REDACTED]' });
  });
});
