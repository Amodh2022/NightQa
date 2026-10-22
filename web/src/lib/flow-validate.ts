import { LineCounter, isMap, isScalar, parseDocument, type Document, type Node } from 'yaml';
import { BETTER_EXPECT_EXAMPLE, flowFileSchema, isVagueExpectation } from './flow-rules';

export interface FlowIssue {
  readonly line: number;
  readonly column: number;
  readonly path: string;
  readonly message: string;
}

export interface FlowWarning {
  readonly line: number;
  readonly message: string;
  /** The step number (1-based) the warning is about. */
  readonly step: number;
}

export interface ValidFlow {
  readonly flow: string;
  readonly start: string;
  readonly login?: string;
  readonly tags: readonly string[];
  readonly steps: readonly { readonly text: string; readonly expect?: string }[];
  readonly variations: readonly string[];
}

export type Validation =
  | { readonly ok: true; readonly flow: ValidFlow; readonly warnings: readonly FlowWarning[] }
  | { readonly ok: false; readonly issues: readonly FlowIssue[] };

const SHORTHAND_STEP = /^(\s*)- (?!step:|expect:)(.+)$/;
const EXPECT_LINE = /^(\s+)expect:\s*(.*)$/;

/** The brief's shorthand (`expect:` under a plain step line) rewritten to `- step:` in place, so line numbers stay. */
export function normalizeShorthand(source: string): string {
  const lines = source.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const exp = EXPECT_LINE.exec(lines[i] ?? '');
    const prev = SHORTHAND_STEP.exec(lines[i - 1] ?? '');
    if (!exp || !prev) continue;
    const [, dashIndent = '', body = ''] = prev;
    if (exp[1] === undefined || exp[1].length <= dashIndent.length) continue;
    if (/^[\w-]+:(\s|$)/.test(body)) continue;
    lines[i - 1] = `${dashIndent}- step: ${JSON.stringify(body.trim())}`;
    lines[i] = `${dashIndent}  expect: ${exp[2] ?? ''}`;
  }
  return lines.join('\n');
}

function nodeAt(doc: Document, path: readonly PropertyKey[]): Node | undefined {
  for (let n = path.length; n >= 0; n--) {
    const node = doc.getIn(path.slice(0, n) as (string | number)[], true);
    if (node && typeof node === 'object' && 'range' in node && node.range) return node as Node;
  }
  return undefined;
}

function keyNode(doc: Document, parentPath: readonly PropertyKey[], key: string): Node | undefined {
  const parent = parentPath.length ? doc.getIn(parentPath as (string | number)[], true) : doc.contents;
  if (!isMap(parent)) return undefined;
  const pair = parent.items.find((p) => isScalar(p.key) && String(p.key.value) === key);
  return pair && isScalar(pair.key) ? pair.key : undefined;
}

/** Validates flow YAML with the engine's rules. Pure: never touches the disk. */
export function validateFlowSource(source: string): Validation {
  const lc = new LineCounter();
  const doc = parseDocument(normalizeShorthand(source), { lineCounter: lc });
  const pos = (offset: number): { line: number; column: number } => {
    const p = lc.linePos(offset);
    return { line: p.line, column: p.col };
  };

  if (doc.errors.length > 0) {
    return {
      ok: false,
      issues: doc.errors.map((e) => ({
        line: e.linePos?.[0].line ?? 1,
        column: e.linePos?.[0].col ?? 1,
        path: '',
        message: `YAML syntax problem: ${e.message.split('\n')[0] ?? e.message}`,
      })),
    };
  }

  const result = flowFileSchema.safeParse(doc.toJS());
  if (!result.success) {
    const issues = result.error.issues.flatMap((iss): FlowIssue[] => {
      const path = iss.path;
      const keys = iss.code === 'unrecognized_keys' ? iss.keys : [undefined];
      return keys.map((k) => {
        const node = (k !== undefined ? keyNode(doc, path, k) : undefined) ?? nodeAt(doc, path);
        const at = pos(node?.range?.[0] ?? 0);
        const where = path.length ? `${path.map(String).join('.')}: ` : '';
        const message = iss.code === 'unrecognized_keys' ? iss.message : `${where}${iss.message}`;
        return { ...at, path: path.map(String).join('.'), message };
      });
    });
    const seen = new Set<string>();
    return {
      ok: false,
      issues: issues.filter((i) => {
        const k = `${String(i.line)}|${i.message}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
    };
  }

  const data = result.data;
  const warnings: FlowWarning[] = [];
  const steps = data.steps.map((s, i) => {
    if (typeof s === 'string') return { text: s };
    if (s.expect !== undefined && isVagueExpectation(s.expect)) {
      const node = nodeAt(doc, ['steps', i]);
      warnings.push({
        line: pos(node?.range?.[0] ?? 0).line,
        step: i + 1,
        message: `Vague expectation "${s.expect}". Say what exactly should be true, for example: "${BETTER_EXPECT_EXAMPLE}".`,
      });
    }
    return s.expect === undefined ? { text: s.step } : { text: s.step, expect: s.expect };
  });
  return {
    ok: true,
    warnings,
    flow: {
      flow: data.flow,
      start: data.start,
      ...(data.login !== undefined ? { login: data.login } : {}),
      tags: data.tags ?? [],
      steps,
      variations: data.variations ?? [],
    },
  };
}
