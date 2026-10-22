import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineCommand } from './launcher';

describe('engineCommand', () => {
  it('runs the TypeScript sources through tsx in development', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nq-root-'));
    const c = engineCommand(root, {});
    expect(c.args).toEqual([join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(root, 'src', 'cli.ts')]);
  });
  it('runs the compiled CLI when asked and it exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nq-root-'));
    await mkdir(join(root, 'dist', 'src'), { recursive: true });
    await writeFile(join(root, 'dist', 'src', 'cli.js'), '');
    expect(engineCommand(root, { NIGHTQA_ENGINE: 'dist' }).args).toEqual([join(root, 'dist', 'src', 'cli.js')]);
  });
  it('falls back to tsx when dist was requested but is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nq-root-'));
    expect(engineCommand(root, { NIGHTQA_ENGINE: 'dist' }).args[0]).toContain('tsx');
  });
});
