import { inflateRawSync } from 'node:zlib';
import { IMPORT_LIMITS, ImportError } from './flow-import';

/**
 * A small, read-only .xlsx reader with no dependencies. An .xlsx is a zip of XML files; we read the cell text and
 * nothing else: no formulas are evaluated, no macros are read, nothing is executed. Sizes are capped while inflating,
 * so a zip bomb cannot use up memory.
 */
const MAX_PART_BYTES = 8 * 1024 * 1024;

interface Entry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly offset: number;
  readonly flags: number;
}

function readEntries(buf: Buffer): Entry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ImportError('This is not a valid .xlsx file.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > 2000) throw new ImportError('This .xlsx file has too many parts.');
  const entries: Entry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ImportError('This is not a valid .xlsx file.');
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    entries.push({
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      offset: buf.readUInt32LE(p + 42),
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readPart(buf: Buffer, e: Entry): string {
  if (e.flags & 1) throw new ImportError('Password-protected files are not supported.');
  if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50) throw new ImportError('This is not a valid .xlsx file.');
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const data = buf.subarray(start, start + e.compressedSize);
  try {
    if (e.method === 0) return data.toString('utf8');
    if (e.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }).toString('utf8');
  } catch {
    throw new ImportError('This .xlsx file is too large or damaged to read.');
  }
  throw new ImportError('This .xlsx file uses an unsupported compression.');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g: string) => {
    if (g.startsWith('#x')) return String.fromCodePoint(Number.parseInt(g.slice(2), 16));
    if (g.startsWith('#')) return String.fromCodePoint(Number.parseInt(g.slice(1), 10));
    return ENTITIES[g] ?? m;
  });
}

const textOf = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1] ?? '')).join('');

/** "C12" -> column index 2. */
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

/** Cell text of the first sheet, as rows of strings. */
export function readXlsxRows(buf: Buffer): string[][] {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) throw new ImportError('This is not a valid .xlsx file.');
  const entries = readEntries(buf);
  if (entries.some((e) => /vbaProject\.bin$/i.test(e.name) || /^xl\/(macrosheets|embeddings)\//i.test(e.name))) {
    throw new ImportError('Files with macros or embedded objects are not accepted. Save a copy as a plain .xlsx or .csv.');
  }
  const part = (name: string): string | undefined => {
    const e = entries.find((x) => x.name === name);
    return e ? readPart(buf, e) : undefined;
  };

  // the first sheet, found through the workbook relationships, falling back to sheet1
  let sheetName = 'xl/worksheets/sheet1.xml';
  const workbook = part('xl/workbook.xml');
  const rels = part('xl/_rels/workbook.xml.rels');
  const rid = workbook ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1] : undefined;
  if (rid && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`));
    const target = rel ? /Target="([^"]+)"/.exec(rel)?.[1] : undefined;
    if (target) sheetName = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  const sheet = part(sheetName);
  if (sheet === undefined) throw new ImportError('Could not find a worksheet in this file.');

  const shared = [...(part('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? ''));
  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length > IMPORT_LIMITS.maxRows + 5) break;
    const cells: string[] = [];
    for (const c of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? '';
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1];
      const kind = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (kind === 's') value = shared[Number(v)] ?? '';
      else if (kind === 'inlineStr') value = textOf(body);
      else if (v !== undefined) value = decodeXml(v);
      const col = ref ? columnIndex(ref) : cells.length;
      if (col >= IMPORT_LIMITS.maxColumns + 5) continue;
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    rows.push(cells);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
