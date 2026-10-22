import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ZodType } from 'zod';
import { dataDir } from './paths';

const chains = new Map<string, Promise<unknown>>();

/** Runs `fn` after every earlier call for the same key, so read-modify-write never interleaves in this process. */
export function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (chains.get(key) ?? Promise.resolve()).then(fn, fn);
  chains.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/** Reads a JSON file and validates it. A missing or invalid file gives the fallback (never throws). */
export async function readJson<T>(name: string, schema: ZodType<T>, fallback: T, dir: string = dataDir()): Promise<T> {
  try {
    const parsed = schema.safeParse(JSON.parse(await readFile(join(dir, name), 'utf8')));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/** Writes atomically (temp file, then rename) with owner-only permissions. */
export async function writeJson(name: string, value: unknown, dir: string = dataDir()): Promise<void> {
  const file = join(dir, name);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.${String(Date.now())}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, file);
  await chmod(file, 0o600).catch(() => undefined);
}

/** Read, change and write one JSON file without losing concurrent updates. */
export function updateJson<T>(name: string, schema: ZodType<T>, fallback: T, change: (current: T) => T, dir: string = dataDir()): Promise<T> {
  return serialize(`${dir}/${name}`, async () => {
    const next = change(await readJson(name, schema, fallback, dir));
    await writeJson(name, next, dir);
    return next;
  });
}
