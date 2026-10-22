import type { FlowDraft } from './flow-yaml';

/** Limits for uploaded test-case files. Anything above is refused or cut, in words. */
export const IMPORT_LIMITS = { maxBytes: 2 * 1024 * 1024, maxRows: 200, maxColumns: 40, maxCellChars: 2000 } as const;

export class ImportError extends Error {
  override readonly name = 'ImportError';
}

export interface Table {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Set when rows beyond the limit were left out. */
  readonly truncated: boolean;
}

/** Splits CSV text (quotes, escaped quotes, newlines in cells) into rows. Detects , ; or tab as the delimiter. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  if (text.includes('\0')) throw new ImportError('This does not look like a text file. Upload a .csv or .xlsx file.');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = ([',', ';', '\t'] as const).reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Turns raw rows into a table: the first row is the header. Applies the row, column and cell limits. */
export function toTable(raw: readonly (readonly string[])[]): Table {
  const [head, ...body] = raw;
  if (!head || body.length === 0) throw new ImportError('The file needs a header row and at least one test case.');
  if (head.length > IMPORT_LIMITS.maxColumns) throw new ImportError(`The file has more than ${String(IMPORT_LIMITS.maxColumns)} columns.`);
  const cut = (s: string): string => s.trim().slice(0, IMPORT_LIMITS.maxCellChars);
  const headers = head.map((h, i) => cut(h) || `Column ${String(i + 1)}`);
  const rows = body.slice(0, IMPORT_LIMITS.maxRows).map((r) => headers.map((_, i) => cut(r[i] ?? '')));
  return { headers, rows, truncated: body.length > IMPORT_LIMITS.maxRows };
}

export const TARGETS = ['name', 'steps', 'expect', 'start', 'login', 'tags', 'id'] as const;
export type Target = (typeof TARGETS)[number];
/** For each target, the index of the source column, or -1 for "not in the file". */
export type Mapping = Record<Target, number>;

export const TARGET_LABELS: Record<Target, string> = {
  name: 'Flow name',
  steps: 'Steps',
  expect: 'Expected result',
  start: 'Start page',
  login: 'Saved test account',
  tags: 'Tags',
  id: 'ID (for your reference)',
};

const HINTS: Record<Target, RegExp> = {
  id: /^(id|#|no\.?|tc[\s_-]?id|test[\s_-]?id|key|ref)\b/i,
  name: /(title|scenario|name|summary|test[\s_-]?case|flow)/i,
  steps: /(steps?|procedure|actions?|instructions?)/i,
  expect: /(expect|result|outcome|should|verify|assert)/i,
  start: /(start|url|page|path|route)/i,
  login: /(login|account|user)/i,
  tags: /(tags?|labels?|priority|category|module|area)/i,
};

/** Suggests a column for every target from the header words. Each column is used at most once. */
export function suggestMapping(headers: readonly string[]): Mapping {
  const used = new Set<number>();
  const m: Mapping = { name: -1, steps: -1, expect: -1, start: -1, login: -1, tags: -1, id: -1 };
  for (const t of ['id', 'steps', 'expect', 'name', 'start', 'login', 'tags'] as const) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && HINTS[t].test(h));
    if (i >= 0) {
      m[t] = i;
      used.add(i);
    }
  }
  return m;
}

/** Splits a "steps" cell: lines first, then "1." numbering, then semicolons, then commas. */
export function splitSteps(cell: string): string[] {
  const clean = (parts: string[]): string[] => parts.map((p) => p.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(Boolean);
  const lines = cell.split(/\r?\n/);
  if (lines.filter((l) => l.trim()).length > 1) return clean(lines);
  const single = cell.trim();
  if (/\b1[.)]\s.*\b2[.)]\s/.test(single)) return clean(single.split(/\s*\b\d+[.)]\s+/));
  if (single.includes(';')) return clean(single.split(';'));
  return clean(single.split(/,\s+/));
}

export interface ImportDefaults {
  readonly start: string;
  readonly login: string;
}

export interface ImportDraft {
  /** 1-based spreadsheet row number of the data row (header is row 1). */
  readonly row: number;
  readonly reference: string;
  readonly draft: FlowDraft;
}

const cellAt = (row: readonly string[], i: number): string => (i >= 0 ? (row[i] ?? '').trim() : '');
const normalizeStart = (s: string): string => (s === '' ? '' : /^https?:\/\//.test(s) || s.startsWith('/') ? s : `/${s}`);

/** One row becomes one draft. The expected result goes on the last step, the one that ends the scenario. */
export function rowsToDrafts(table: Table, mapping: Mapping, defaults: ImportDefaults): ImportDraft[] {
  return table.rows.map((row, i) => {
    const texts = splitSteps(cellAt(row, mapping.steps));
    const expect = cellAt(row, mapping.expect);
    const steps = (texts.length ? texts : ['']).map((text, n, all) => ({ text, expect: n === all.length - 1 ? expect : '' }));
    const tags = cellAt(row, mapping.tags)
      .split(/[,;|]/)
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
      .filter(Boolean);
    const login = cellAt(row, mapping.login) || defaults.login;
    return {
      row: i + 2,
      reference: cellAt(row, mapping.id),
      draft: {
        name: cellAt(row, mapping.name),
        start: normalizeStart(cellAt(row, mapping.start)) || defaults.start,
        login: /^[A-Za-z0-9][\w-]*$/.test(login) ? login : '',
        tags,
        steps,
        variations: [],
      },
    };
  });
}
