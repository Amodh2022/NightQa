import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadFlowFile } from '../src/io/load-flow.js';

const files = [
  ...readdirSync('flows')
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => join('flows', f)),
  ...readdirSync(join('flows', 'zoo'))
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => join('flows', 'zoo', f)),
];

describe('shipped flow files', () => {
  it('finds the flows', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });
  it.each(files)('%s is valid and has no vague expectations', async (file) => {
    const { flow, warnings } = await loadFlowFile(file);
    expect(flow.steps.some((s) => s.expect)).toBe(true);
    expect(warnings).toEqual([]);
  });
});
