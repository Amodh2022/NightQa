import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { ulid } from 'ulid';
import { audit } from './audit';
import { engineEnv, settingsFlags } from './engine-args';
import { listFlows, slugify } from './flows';
import { PERSONAS, getSettings } from './settings';
import { VaultError, getSecret } from './vault';
import { allowPrivateNetwork, flowsDir, repoRoot, resultsDir, targetUrl, testsDir } from './paths';

export class LaunchError extends Error {
  override readonly name = 'LaunchError';
}

export type ExplorePersona = (typeof PERSONAS)[number];

export interface StartRunInput {
  /** Flow file, relative to the repo root (for example flows/checkout.yaml). Not used by "explore". */
  readonly flowFile: string;
  /** "run" uses the AI. "replay" re-runs the saved test with no AI. "explore" wanders the app as one persona. */
  readonly mode: 'run' | 'replay' | 'explore';
  /** Required for "explore". */
  readonly persona?: string;
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

/** Engine arguments for an exploration run. Throws LaunchError for an unknown persona. */
export function exploreArgs(persona: string | undefined, common: readonly string[]): string[] {
  const p = PERSONAS.find((x) => x === persona);
  if (!p) throw new LaunchError('Choose one of the exploration personas.');
  return ['explore', ...common, '--persona', p];
}

/**
 * Starts the engine CLI in the background for one flow and returns the run id. The run writes to
 * results/<id>/, which the dashboard polls. The target URL comes from the dashboard's own configuration,
 * never from the request, so the web UI cannot be used to point NightQA at another host.
 */
export async function startRun(input: StartRunInput): Promise<{ id: string }> {
  const exploring = input.mode === 'explore';
  const abs = exploring ? undefined : safeFlowPath(input.flowFile);
  const found = abs ? (await listFlows()).find((f) => resolve(repoRoot(), f.file) === abs) : undefined;
  if (!exploring && (!found || found.error)) throw new LaunchError(found?.error ?? 'That flow could not be read.');
  // Exploration is not tied to a flow: it uses the default profile and no saved login.
  const flow = found ?? { name: `Explore: ${input.persona ?? ''}`, file: '', login: undefined as string | undefined };

  const settings = await getSettings();
  if (settings.autonomy.paused) throw new LaunchError('NightQA is paused. Resume it in Autonomy and policy to start runs.');
  const engine = engineCommand();
  const args = [...engine.args];
  const id = ulid();
  const results = resultsDir();
  const url = settings.app.targetUrl || targetUrl();
  const common = ['--url', url, '--results', results, '--run-id', id, ...(allowPrivateNetwork() ? ['--allow-private-network'] : []), ...settingsFlags(settings, flow.file)];
  if (exploring) {
    if (!settings.exploration.enabled) throw new LaunchError('Exploration is switched off. Turn it on in Exploration to run it.');
    if (!settings.exploration.personas.some((p) => p === input.persona)) throw new LaunchError('That persona is not enabled in Exploration.');
    args.push(...exploreArgs(input.persona, common));
  } else if (input.mode === 'replay') {
    const recording = join(testsDir(), `${slugify(flow.name)}.recording.json`);
    if (!existsSync(recording)) throw new LaunchError('This flow has no saved test yet. Run it with the AI once and let it pass.');
    args.push('replay', ...common, '--test', recording);
  } else if (abs) {
    args.push('run', ...common, '--flow', relative(repoRoot(), abs));
  }

  const dir = join(results, id);
  await mkdir(dir, { recursive: true });
  const out = openSync(join(dir, 'cli.log'), 'a');
  try {
    // A missing vault key means no stored secrets; the engine then falls back to the environment.
    const secret = (name: string): Promise<string | undefined> => getSecret(name).catch((e: unknown) => (e instanceof VaultError ? undefined : Promise.reject(e)));
    const extra = await engineEnv(settings, secret, flow.login, process.env.NIGHTQA_PUBLIC_URL);
    if (exploring) extra.NIGHTQA_MAX_STEPS = String(settings.exploration.maxSteps);
    const child = spawn(engine.cmd, args, { cwd: repoRoot(), detached: true, stdio: ['ignore', out, out], env: { ...process.env, ...extra } });
    child.unref();
    await writeFile(
      join(dir, 'job.json'),
      `${JSON.stringify({ flowName: flow.name, flowFile: flow.file, mode: input.mode === 'replay' ? 'replay' : 'run', startedAt: new Date().toISOString(), pid: child.pid, ...(input.startedBy ? { startedBy: input.startedBy } : {}) })}\n`,
    );
  } finally {
    closeSync(out);
  }
  await audit(input.startedBy ?? 'unknown', 'run.start', `${flow.name} (${input.mode})`).catch(() => undefined);
  return { id };
}
