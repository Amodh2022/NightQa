import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { RunResult } from '../core/agent/loop.js';
import type { DriverArtifacts } from '../core/ports.js';
import { redactDeep } from '../core/redact.js';

export interface RunMeta {
  readonly startedAt: string;
  readonly url: string;
  readonly flowSource: string;
  readonly budgets: {
    readonly maxSteps: number;
    readonly maxSeconds: number;
    readonly maxCostUsd: number;
  };
}

/** Writes result.json (and actions.json, used by regression replay) into the run folder. Secrets are scrubbed. */
export async function writeRunResults(
  dir: string,
  result: RunResult,
  artifacts: DriverArtifacts,
  meta: RunMeta,
  secrets: readonly string[],
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const rel = (p: string | undefined): string | undefined => (p ? relative(dir, p) : undefined);
  const body = redactDeep(
    {
      ...result,
      ...meta,
      artifacts: {
        video: rel(artifacts.videoPath),
        trace: rel(artifacts.tracePath),
        screenshots: artifacts.screenshots.map((s) => relative(dir, s)),
      },
    },
    secrets,
  );
  await writeFile(join(dir, 'result.json'), `${JSON.stringify(body, null, 2)}\n`);
  await writeFile(
    join(dir, 'actions.json'),
    `${JSON.stringify(redactDeep(result.actions, secrets), null, 2)}\n`,
  );
}
