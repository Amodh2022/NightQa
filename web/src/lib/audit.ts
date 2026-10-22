import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { dataDir } from './paths';
import { serialize } from './store';

const event = z.object({
  at: z.string(),
  who: z.string(),
  action: z.string(),
  detail: z.string().optional(),
});
export type AuditEvent = z.infer<typeof event>;

const FILE = 'audit.jsonl';

/** Appends one line to the activity log. Never contains secret values: callers pass names and short facts only. */
export async function audit(who: string, action: string, detail?: string, dir: string = dataDir(), now: () => Date = () => new Date()): Promise<void> {
  const line = JSON.stringify({ at: now().toISOString(), who, action, ...(detail ? { detail: detail.slice(0, 300) } : {}) } satisfies AuditEvent);
  await serialize(`${dir}/${FILE}`, async () => {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await appendFile(join(dir, FILE), `${line}\n`, { mode: 0o600 });
  });
}

/** The most recent events, newest first. Unreadable lines are skipped. */
export async function recentAudit(limit = 50, dir: string = dataDir()): Promise<AuditEvent[]> {
  const text = await readFile(join(dir, FILE), 'utf8').catch(() => '');
  const out: AuditEvent[] = [];
  for (const l of text.split('\n').reverse()) {
    if (!l.trim()) continue;
    try {
      const p = event.safeParse(JSON.parse(l));
      if (p.success) out.push(p.data);
    } catch {
      /* skip */
    }
    if (out.length >= limit) break;
  }
  return out;
}
