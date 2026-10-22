import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LaunchError, engineCommand, exploreArgs } from './launcher';
import { runRequest } from './run-request';

describe('exploreArgs', () => {
  it('puts the persona after the common flags', () => {
    expect(exploreArgs('careless-typer', ['--url', 'http://x'])).toEqual(['explore', '--url', 'http://x', '--persona', 'careless-typer']);
  });
  it('refuses an unknown or missing persona', () => {
    expect(() => exploreArgs('hacker', [])).toThrow(LaunchError);
    expect(() => exploreArgs(undefined, [])).toThrow(LaunchError);
  });
});

describe('runRequest', () => {
  it('accepts a flow run, a replay and an exploration', () => {
    expect(runRequest.safeParse({ mode: 'run', flowFile: 'flows/a.yaml' }).success).toBe(true);
    expect(runRequest.safeParse({ mode: 'replay', flowFile: 'flows/a.yaml' }).success).toBe(true);
    expect(runRequest.safeParse({ mode: 'explore', persona: 'keyboard-only' }).success).toBe(true);
  });
  it('rejects explore without a known persona, and a run without a flow', () => {
    expect(runRequest.safeParse({ mode: 'explore' }).success).toBe(false);
    expect(runRequest.safeParse({ mode: 'explore', persona: 'x' }).success).toBe(false);
    expect(runRequest.safeParse({ mode: 'run' }).success).toBe(false);
  });
});

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
