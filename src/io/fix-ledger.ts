import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { FixLedger } from '../core/github/report.js';

const fileSchema = z.record(z.string(), z.array(z.string()));

/** Remembers which bugs got a fix request on which night, in a small JSON file. */
export class FileFixLedger implements FixLedger {
  constructor(private readonly path: string) {}

  private async read(): Promise<Record<string, string[]>> {
    try {
      return fileSchema.parse(JSON.parse(await readFile(this.path, 'utf8')));
    } catch {
      return {};
    }
  }

  async count(date: string): Promise<number> {
    return (await this.read())[date]?.length ?? 0;
  }

  async record(date: string, bugId: string): Promise<void> {
    const data = await this.read();
    const ids = data[date] ?? [];
    if (!ids.includes(bugId)) ids.push(bugId);
    // Keep the file small: only the last 14 nights.
    const keep = Object.fromEntries(
      Object.entries({ ...data, [date]: ids })
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14),
    );
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(keep, null, 2)}\n`);
  }
}
