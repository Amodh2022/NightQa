import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { IMPORT_LIMITS, ImportError, parseCsv, rowsToDrafts, splitSteps, suggestMapping, toTable } from './flow-import';
import { parseUpload } from './flow-upload';
import { validateFlowSource } from './flow-validate';
import { draftToYaml } from './flow-yaml';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, newlines in cells, BOM and CRLF', () => {
    const rows = parseCsv('﻿ID,Title,Steps\r\nTC-1,"Pay, ""fast""","open cart\npay"\r\nTC-2,B,c\r\n');
    expect(rows).toEqual([
      ['ID', 'Title', 'Steps'],
      ['TC-1', 'Pay, "fast"', 'open cart\npay'],
      ['TC-2', 'B', 'c'],
    ]);
  });
  it('detects semicolons and tabs', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('rejects binary content', () => {
    expect(() => parseCsv('a,b\0')).toThrow(ImportError);
  });
});

describe('toTable', () => {
  it('needs a header and a row, and caps rows', () => {
    expect(() => toTable([['a']])).toThrow(ImportError);
    const many = [['a'], ...Array.from({ length: IMPORT_LIMITS.maxRows + 3 }, (_, i) => [String(i)])];
    const t = toTable(many);
    expect(t.rows).toHaveLength(IMPORT_LIMITS.maxRows);
    expect(t.truncated).toBe(true);
  });
});

describe('suggestMapping and rowsToDrafts', () => {
  const csv = 'ID,Scenario,Steps,Expected result\nTC-001,Checkout with card,"Add item, open cart, pay with test card",Order number is shown\nTC-003,Reset password,"Open login, click Forgot password, enter email",Should work properly\n,,,\n';
  const table = toTable(parseCsv(csv));
  const mapping = suggestMapping(table.headers);

  it('suggests columns from header words', () => {
    expect(mapping).toMatchObject({ id: 0, name: 1, steps: 2, expect: 3, start: -1 });
  });

  it('turns one row into one draft with the expectation on the last step', () => {
    const drafts = rowsToDrafts(table, mapping, { start: '/', login: 'test-buyer' });
    expect(drafts[0]?.reference).toBe('TC-001');
    expect(drafts[0]?.row).toBe(2);
    expect(drafts[0]?.draft.steps).toEqual([
      { text: 'Add item', expect: '' },
      { text: 'open cart', expect: '' },
      { text: 'pay with test card', expect: 'Order number is shown' },
    ]);
    expect(drafts[0]?.draft.login).toBe('test-buyer');
  });

  it('flags vague and missing expectations through the real rules', () => {
    const [ok, vague] = rowsToDrafts(table, mapping, { start: '/', login: '' });
    expect(validateFlowSource(draftToYaml(ok?.draft ?? { name: '', start: '', login: '', tags: [], steps: [], variations: [] })).ok).toBe(true);
    const v = validateFlowSource(draftToYaml(vague?.draft ?? { name: '', start: '', login: '', tags: [], steps: [], variations: [] }));
    expect(v.ok && v.warnings.length).toBe(1);
    const noExpect = rowsToDrafts(toTable(parseCsv('Title,Steps\nA,do it')), suggestMapping(['Title', 'Steps']), { start: '/', login: '' });
    const r = validateFlowSource(draftToYaml(noExpect[0]?.draft ?? { name: '', start: '', login: '', tags: [], steps: [], variations: [] }));
    expect(!r.ok && r.issues.some((i) => i.message.includes('at least one "expect:"'))).toBe(true);
  });

  it('drops a login cell that is not an account name instead of keeping it', () => {
    const t = toTable(parseCsv('Title,Steps,Account\nA,do it,my secret pass'));
    const m = suggestMapping(t.headers);
    expect(rowsToDrafts(t, m, { start: '/', login: '' })[0]?.draft.login).toBe('');
  });
});

describe('splitSteps', () => {
  it('splits on lines, numbering, semicolons, then commas', () => {
    expect(splitSteps('1. open\n2. pay')).toEqual(['open', 'pay']);
    expect(splitSteps('1. open 2. pay')).toEqual(['open', 'pay']);
    expect(splitSteps('open; pay')).toEqual(['open', 'pay']);
    expect(splitSteps('open, pay')).toEqual(['open', 'pay']);
    expect(splitSteps('Blue T-shirt,size M')).toEqual(['Blue T-shirt,size M']);
  });
});

/** A minimal zip with stored (or deflated) parts, to test the .xlsx reader without a fixture file. */
function zip(parts: Record<string, string>, deflate = false): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const raw = Buffer.from(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(deflate ? 8 : 0, 8);
    l.writeUInt32LE(data.length, 18);
    l.writeUInt32LE(raw.length, 22);
    l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    locals.push(l, n, data);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(parts).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>Expected result</t></is></c></row>
<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c></row>
</sheetData></worksheet>`;
const SST = '<sst><si><t>Title</t></si><si><t>Steps</t></si><si><t>Pay &amp; go</t></si><si><r><t>Total is </t></r><r><t>$5</t></r></si></sst>';

describe('parseUpload', () => {
  it('reads cell text from an .xlsx, including skipped cells and shared strings', () => {
    for (const deflate of [false, true]) {
      const t = parseUpload('cases.xlsx', zip({ 'xl/worksheets/sheet1.xml': SHEET, 'xl/sharedStrings.xml': SST }, deflate));
      expect(t.headers).toEqual(['Title', 'Steps', 'Expected result']);
      expect(t.rows).toEqual([['Pay & go', '', 'Total is $5']]);
    }
  });
  it('refuses macros, odd types, empty and oversized files', () => {
    expect(() => parseUpload('a.xlsx', zip({ 'xl/vbaProject.bin': 'x', 'xl/worksheets/sheet1.xml': SHEET }))).toThrow(/macros/);
    expect(() => parseUpload('a.xlsm', Buffer.from('x'))).toThrow(/Macro/);
    expect(() => parseUpload('a.exe', Buffer.from('x'))).toThrow(/\.csv or \.xlsx/);
    expect(() => parseUpload('a.csv', Buffer.alloc(0))).toThrow(/empty/);
    expect(() => parseUpload('a.csv', Buffer.alloc(IMPORT_LIMITS.maxBytes + 1, 97))).toThrow(/larger/);
    expect(() => parseUpload('a.xlsx', Buffer.from('not a zip at all'))).toThrow(ImportError);
    expect(() => parseUpload('a.csv', zip({ 'a': 'b' }))).toThrow(/zip/);
  });
  it('does not evaluate formulas: a "=" cell stays text', () => {
    const t = parseUpload('a.csv', Buffer.from('Title,Steps\n=HYPERLINK("http://x"),=1+1\n'));
    expect(t.rows[0]).toEqual(['=HYPERLINK("http://x")', '=1+1']);
  });
});
