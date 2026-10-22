import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import type { SpecRunResult } from '../core/testwriter/judge.js';

export interface RunSpecOptions {
  readonly baseUrl: string;
  readonly executablePath?: string;
  readonly timeoutMs?: number;
  /** Extra environment for the test, such as test account credentials. */
  readonly env?: Readonly<Record<string, string>>;
}

const reportSchema = z.object({
  suites: z.array(z.unknown()).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

interface Node {
  specs?: { tests?: { results?: { status?: string; error?: { message?: string } }[] }[] }[];
  suites?: Node[];
}

function firstResult(node: Node): { status?: string; error?: { message?: string } } | undefined {
  for (const spec of node.specs ?? [])
    for (const t of spec.tests ?? []) {
      const r = t.results?.at(-1);
      if (r) return r;
    }
  for (const s of node.suites ?? []) {
    const r = firstResult(s);
    if (r) return r;
  }
  return undefined;
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** Reads the Playwright JSON report into a plain result. Exported for tests. */
export function parseSpecReport(stdout: string): SpecRunResult {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return { status: 'error', message: 'Playwright produced no readable report' };
  }
  const report = reportSchema.safeParse(json);
  if (!report.success) return { status: 'error', message: 'unexpected Playwright report' };
  const result = firstResult({ suites: report.data.suites as Node[] });
  if (!result) {
    return {
      status: 'error',
      message: report.data.errors?.[0]?.message.replace(ANSI, '') ?? 'no test result in the report',
    };
  }
  if (result.status === 'passed') return { status: 'passed', message: '' };
  if (result.status === 'failed' || result.status === 'timedOut') {
    return { status: 'failed', message: (result.error?.message ?? 'failed').replace(ANSI, '') };
  }
  return { status: 'error', message: `test ended as ${result.status ?? 'unknown'}` };
}

/**
 * Runs one generated spec with the real Playwright test runner against `baseUrl` and returns what happened.
 * Uses its own throwaway config (no retries, one worker, hard timeout), never the customer's.
 */
export async function runSpec(specPath: string, opts: RunSpecOptions): Promise<SpecRunResult> {
  const require = createRequire(import.meta.url);
  const cli = require.resolve('@playwright/test/cli');
  const dir = await mkdtemp(join(tmpdir(), 'nightqa-spec-'));
  try {
    // Run a copy next to a node_modules that can see @playwright/test, so a spec stored anywhere resolves it.
    const testsDir = join(dir, 'tests');
    await mkdir(testsDir, { recursive: true });
    await mkdir(join(dir, 'node_modules', '@playwright'), { recursive: true });
    await symlink(
      dirname(require.resolve('@playwright/test/package.json')),
      join(dir, 'node_modules', '@playwright', 'test'),
    );
    await copyFile(specPath, join(testsDir, basename(specPath)));
    const config = join(dir, 'playwright.config.mjs');
    await writeFile(
      config,
      `export default ${JSON.stringify({
        testDir: testsDir,
        testMatch: basename(specPath),
        retries: 0,
        workers: 1,
        timeout: 30000,
        expect: { timeout: 5000 },
        reporter: [['json']],
        outputDir: join(dir, 'out'),
        use: {
          baseURL: opts.baseUrl,
          headless: true,
          ...(opts.executablePath
            ? { launchOptions: { executablePath: opts.executablePath } }
            : {}),
        },
      })};\n`,
    );
    return await new Promise<SpecRunResult>((resolve) => {
      const child = spawn(process.execPath, [cli, 'test', '--config', config], {
        env: { ...process.env, ...opts.env, NIGHTQA_BASE_URL: opts.baseUrl, CI: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr.on('data', (d: Buffer) => (err += d.toString()));
      const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 90_000);
      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ status: 'error', message: e.message });
      });
      child.on('close', () => {
        clearTimeout(timer);
        const parsed = parseSpecReport(out);
        resolve(
          parsed.status === 'error' && err.trim()
            ? { status: 'error', message: `${parsed.message}: ${err.trim().split('\n')[0] ?? ''}` }
            : parsed,
        );
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
