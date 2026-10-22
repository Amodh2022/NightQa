import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { ulid } from 'ulid';
import { listFlows, slugify } from './flows';
import { allowPrivateNetwork, flowsDir, repoRoot, resultsDir, targetUrl, testsDir } from './paths';

export class LaunchError extends Error {
  override readonly name = 'LaunchError';
}

export interface StartRunInput {
  /** Flow file, relative to the repo root (for example flows/checkout.yaml). */
  readonly flowFile: string;
  /** "run" uses the AI. "replay" re-runs the saved test with no AI. */
  readonly mode: 'run' | 'replay';
  /** The signed-in person who pressed the button. Saved with the run. */
  readonly startedBy?: string;
}

/**
 * How to start the engine. In a container the compiled CLI is used (NIGHTQA_ENGINE=dist); in development the
 * TypeScript sources run through tsx.
 */
export function engineCommand(root: string = repoRoot(), env: Readonly<Record<string, string | undefined>> = process.env): { cmd: string; args: string[] } {
  const built = join(root, 'dist', 'src', 'cli.js');
  if (env.NIGHTQA_ENGINE === 'dist' && existsSync(built)) return { cmd: process.execPath, args: [built] };
  return { cmd: process.execPath, args: [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(root, 'src', 'cli.ts')] };
}

/** Confirms the flow file is inside flows/ and really exists. Refuses anything else. */
export function safeFlowPath(flowFile: string): string {
  const abs = resolve(repoRoot(), flowFile);
  const base = flowsDir();
  if (!abs.startsWith(base + sep) || !/\.ya?ml$/.test(abs) || !existsSync(abs)) throw new LaunchError('That flow file does not exist.');
  return abs;
}

/**
 * Starts the engine CLI in the background for one flow and returns the run id. The run writes to
 * results/<id>/, which the dashboard polls. The target URL comes from the dashboard's own configuration,
 * never from the request, so the web UI cannot be used to point NightQA at another host.
 */
export async function startRun(input: StartRunInput): Promise<{ id: string }> {
  const abs = safeFlowPath(input.flowFile);
  const flow = (await listFlows()).find((f) => resolve(repoRoot(), f.file) === abs);
  if (!flow || flow.error) throw new LaunchError(flow?.error ?? 'That flow could not be read.');

  const engine = engineCommand();
  const args = [...engine.args];
  const id = ulid();
  const results = resultsDir();
  const common = ['--url', targetUrl(), '--results', results, '--run-id', id, ...(allowPrivateNetwork() ? ['--allow-private-network'] : [])];
  if (input.mode === 'replay') {
    const recording = join(testsDir(), `${slugify(flow.name)}.recording.json`);
    if (!existsSync(recording)) throw new LaunchError('This flow has no saved test yet. Run it with the AI once and let it pass.');
    args.push('replay', ...common, '--test', recording);
  } else {
    args.push('run', ...common, '--flow', relative(repoRoot(), abs));
  }

  const dir = join(results, id);
  await mkdir(dir, { recursive: true });
  const out = openSync(join(dir, 'cli.log'), 'a');
  try {
    const child = spawn(engine.cmd, args, { cwd: repoRoot(), detached: true, stdio: ['ignore', out, out], env: process.env });
    child.unref();
    await writeFile(
      join(dir, 'job.json'),
      `${JSON.stringify({ flowName: flow.name, flowFile: flow.file, mode: input.mode, startedAt: new Date().toISOString(), pid: child.pid, ...(input.startedBy ? { startedBy: input.startedBy } : {}) })}\n`,
    );
  } finally {
    closeSync(out);
  }
  return { id };
}
