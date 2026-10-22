import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileFixLedger } from './fix-ledger.js';

describe('FileFixLedger', () => {
  it('counts per night, ignores repeats of one bug, and survives a missing or broken file', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'nightqa-ledger-')), 'sub', 'ledger.json');
    const ledger = new FileFixLedger(path);
    expect(await ledger.count('2026-10-22')).toBe(0);
    await ledger.record('2026-10-22', 'a');
    await ledger.record('2026-10-22', 'a');
    await ledger.record('2026-10-22', 'b');
    await ledger.record('2026-10-23', 'a');
    expect(await ledger.count('2026-10-22')).toBe(2);
    expect(await new FileFixLedger(path).count('2026-10-23')).toBe(1);
  });
});
