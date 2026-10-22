import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { slugify } from './flows';
import { draftToYaml, yamlToDraft, type FlowDraft } from './flow-yaml';
import { validateFlowSource, type FlowIssue, type FlowWarning } from './flow-validate';
import { engineCommand } from './launcher';
import { flowsDir, repoRoot } from './paths';

export class FlowStoreError extends Error {
  override readonly name = 'FlowStoreError';
  constructor(
    message: string,
    readonly kind: 'invalid' | 'path' | 'exists' | 'missing' | 'engine',
    readonly issues: readonly FlowIssue[] = [],
  ) {
    super(message);
  }
}

/** Resolves "flows/x.yaml" (or "x.yaml") to an absolute path inside flows/. Anything else is refused. */
export function flowPath(file: string): string {
  const rel = file.replace(/^flows[\\/]/, '');
  const abs = resolve(flowsDir(), rel);
  if (!abs.startsWith(flowsDir() + sep) || !/\.ya?ml$/.test(abs) || basename(abs).startsWith('.') || file.includes('\0')) {
    throw new FlowStoreError('That is not a flow file inside flows/.', 'path');
  }
  return abs;
}

/** The repo-relative name the rest of the dashboard uses, for example flows/checkout.yaml. */
export const flowFileName = (abs: string): string => relative(repoRoot(), abs).split(sep).join('/');

export type EngineCheck = (absFile: string) => Promise<{ ok: true } | { ok: false; message: string }>;

/** Runs the real engine loader (`nightqa check-flow`) on a file. Fails closed when the engine cannot run. */
export const engineCheckFlow: EngineCheck = (absFile) =>
  new Promise((done) => {
    const e = engineCommand();
    execFile(
      e.cmd,
      [...e.args, 'check-flow', absFile],
      { cwd: repoRoot(), timeout: 30_000, env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } },
      (err, _out, stderr) => {
        if (!err) return done({ ok: true });
        const code = (err as { code?: unknown }).code;
        const text = stderr.trim().split('\n').slice(0, 3).join(' ');
        done({ ok: false, message: code === 2 && text ? text : 'The engine could not be started to double-check this file, so nothing was saved.' });
      },
    );
  });

export interface SaveResult {
  readonly file: string;
  readonly warnings: readonly FlowWarning[];
}

async function exists(abs: string): Promise<boolean> {
  return lstat(abs).then(
    () => true,
    () => false,
  );
}

async function freeName(slug: string): Promise<string> {
  for (let n = 1; n < 200; n++) {
    const abs = join(flowsDir(), `${slug}${n === 1 ? '' : `-${String(n)}`}.yaml`);
    if (!(await exists(abs))) return abs;
  }
  throw new FlowStoreError('Too many flows with that name.', 'exists');
}

/**
 * Validates, double-checks with the engine, then writes flows/<slug>.yaml atomically.
 * With `file` it replaces that existing flow in place. Without it, `onConflict` decides what a taken name does.
 */
export async function saveFlow(
  draft: FlowDraft,
  opts: { file?: string; onConflict?: 'fail' | 'suffix'; check?: EngineCheck } = {},
): Promise<SaveResult> {
  const source = draftToYaml(draft);
  const v = validateFlowSource(source);
  if (!v.ok) throw new FlowStoreError(v.issues.map((i) => i.message).join('; '), 'invalid', v.issues);

  let target: string;
  if (opts.file) {
    target = flowPath(opts.file);
    if (!(await exists(target))) throw new FlowStoreError('That flow no longer exists.', 'missing');
  } else if (opts.onConflict === 'suffix') {
    await mkdir(flowsDir(), { recursive: true });
    target = await freeName(slugify(v.flow.flow));
  } else {
    target = flowPath(`${slugify(v.flow.flow)}.yaml`);
    if (await exists(target)) throw new FlowStoreError(`A flow file named ${basename(target)} already exists. Rename the flow or edit that one.`, 'exists');
  }
  if ((await exists(target)) && (await lstat(target)).isSymbolicLink()) throw new FlowStoreError('Refusing to overwrite a symbolic link.', 'path');

  await mkdir(dirname(target), { recursive: true });
  const tmp = join(dirname(target), `.${basename(target, '.yaml')}.${String(process.pid)}.${String(Date.now())}.yaml`);
  await writeFile(tmp, source, { mode: 0o644, flag: 'wx' });
  try {
    const checked = await (opts.check ?? engineCheckFlow)(tmp);
    if (!checked.ok) throw new FlowStoreError(checked.message, 'engine');
    await rename(tmp, target);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
  return { file: flowFileName(target), warnings: v.warnings };
}

export async function deleteFlow(file: string): Promise<void> {
  const abs = flowPath(file);
  if (!(await exists(abs))) throw new FlowStoreError('That flow no longer exists.', 'missing');
  await rm(abs);
}

/** Loads a flow from disk into form fields. Undefined when missing or not a mapping. */
export async function readFlowDraft(file: string): Promise<{ file: string; draft: FlowDraft } | undefined> {
  const abs = flowPath(file);
  const text = await readFile(abs, 'utf8').catch(() => undefined);
  const draft = text === undefined ? undefined : yamlToDraft(text);
  return draft ? { file: flowFileName(abs), draft } : undefined;
}
