import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { flowsDir, repoRoot, testsDir } from './paths';

const flowDoc = z.object({
  flow: z.string(),
  start: z.string(),
  login: z.string().optional(),
  tags: z.array(z.string()).optional(),
  steps: z.array(z.union([z.string(), z.object({ step: z.string(), expect: z.string().optional() })])),
  variations: z.array(z.string()).optional(),
});

export interface FlowInfo {
  readonly file: string; // relative to the repo root, e.g. flows/checkout.yaml
  readonly name: string;
  readonly tags: readonly string[];
  readonly steps: number;
  readonly expectations: number;
  readonly variations: number;
  readonly hasSavedTest: boolean;
  readonly error?: string;
}

/** Same file-name rule as the engine's recording saver. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'flow';
}

/** The engine accepts a shorthand `- text` + `expect:` layout; count expectations in the raw text too. */
export function countExpectations(text: string): number {
  return (text.match(/^\s*expect:/gm) ?? []).length;
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.yaml') || e.name.endsWith('.yml')) out.push(p);
  }
  return out.sort();
}

export async function listFlows(): Promise<FlowInfo[]> {
  const files = await walk(flowsDir());
  return Promise.all(
    files.map(async (abs): Promise<FlowInfo> => {
      const file = relative(repoRoot(), abs);
      const text = await readFile(abs, 'utf8');
      try {
        // the shorthand form is not strict YAML, so fall back to a line-based read for the name
        const doc = flowDoc.safeParse(parse(text));
        const name = doc.success ? doc.data.flow : /^flow:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? file;
        return {
          file,
          name,
          tags: doc.success ? (doc.data.tags ?? []) : [],
          steps: doc.success ? doc.data.steps.length : (text.match(/^\s*- /gm) ?? []).length,
          expectations: countExpectations(text),
          variations: doc.success ? (doc.data.variations?.length ?? 0) : 0,
          hasSavedTest: existsSync(join(testsDir(), `${slugify(name)}.recording.json`)),
        };
      } catch (e) {
        return { file, name: file, tags: [], steps: 0, expectations: 0, variations: 0, hasSavedTest: false, error: e instanceof Error ? e.message.split('\n')[0] : 'unreadable' };
      }
    }),
  );
}
