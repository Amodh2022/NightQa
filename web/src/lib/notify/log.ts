import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { dataDir } from '../paths';
import { clean } from '../report';
import { serialize } from '../store';

export const deliverySchema = z.object({
  at: z.string(),
  channel: z.enum(['email', 'slack', 'webhook']),
  /** morning = the morning report, critical = an immediate alert, test = a test message. */
  kind: z.enum(['morning', 'critical', 'test']),
  ok: z.boolean(),
  reason: z.string(),
  subject: z.string().optional(),
  bugId: z.string().optional(),
});
export type Delivery = z.infer<typeof deliverySchema>;

const FILE = 'notifications.jsonl';
const KEEP = 500;

/** Appends one delivery result. Reasons are already safe (see senders); they are trimmed again here. */
export async function recordDelivery(d: Omit<Delivery, 'at'>, dir: string = dataDir(), now: () => Date = () => new Date()): Promise<void> {
  const line = JSON.stringify({ ...d, at: now().toISOString(), reason: clean(d.reason, 200), ...(d.subject ? { subject: clean(d.subject, 120) } : {}) });
  await serialize(`${dir}/${FILE}`, async () => {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await appendFile(join(dir, FILE), `${line}\n`, { mode: 0o600 });
    // keep the log bounded: rewrite it occasionally with only the newest lines
    const text = await readFile(join(dir, FILE), 'utf8').catch(() => '');
    const lines = text.split('\n').filter(Boolean);
    if (lines.length > KEEP * 2) await writeFile(join(dir, FILE), `${lines.slice(-KEEP).join('\n')}\n`, { mode: 0o600 });
  });
}

/** Newest first. Unreadable lines are skipped. */
export async function recentDeliveries(limit = 30, dir: string = dataDir()): Promise<Delivery[]> {
  const text = await readFile(join(dir, FILE), 'utf8').catch(() => '');
  const out: Delivery[] = [];
  for (const l of text.split('\n').reverse()) {
    if (!l.trim()) continue;
    try {
      const p = deliverySchema.safeParse(JSON.parse(l));
      if (p.success) out.push(p.data);
    } catch {
      /* skip */
    }
    if (out.length >= limit) break;
  }
  return out;
}
