import { readFile } from 'node:fs/promises';
import { parseFlow, type ParsedFlow } from '../core/flow/parse.js';

/** Reads and validates a flow file from disk. */
export async function loadFlowFile(path: string): Promise<ParsedFlow> {
  const text = await readFile(path, 'utf8');
  return parseFlow(text, path);
}
