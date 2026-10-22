import { parse, stringify } from 'yaml';
import { normalizeShorthand } from './flow-validate';

export interface DraftStep {
  text: string;
  expect: string;
}

/** What the editor form edits. Empty strings mean "not set". */
export interface FlowDraft {
  name: string;
  start: string;
  login: string;
  tags: string[];
  steps: DraftStep[];
  variations: string[];
}

export const emptyDraft = (): FlowDraft => ({ name: '', start: '/', login: '', tags: [], steps: [{ text: '', expect: '' }], variations: [] });

const clean = (s: string): string => s.trim();

/** The YAML file for a draft. Blank steps, tags and variations are dropped; blank required fields stay so validation can name them. */
export function draftToYaml(d: FlowDraft): string {
  const steps = d.steps
    .filter((s) => clean(s.text) || clean(s.expect))
    .map((s) => (clean(s.expect) ? { step: clean(s.text), expect: clean(s.expect) } : clean(s.text)));
  const tags = d.tags.map(clean).filter(Boolean);
  const variations = d.variations.map(clean).filter(Boolean);
  const doc: Record<string, unknown> = { flow: clean(d.name), start: clean(d.start) };
  if (clean(d.login)) doc.login = clean(d.login);
  if (tags.length) doc.tags = tags;
  doc.steps = steps;
  if (variations.length) doc.variations = variations;
  return stringify(doc, { lineWidth: 0 });
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Loads flow YAML (including the engine's shorthand) into form fields. Returns undefined when it is not a mapping. */
export function yamlToDraft(source: string): FlowDraft | undefined {
  let raw: unknown;
  try {
    raw = parse(normalizeShorthand(source));
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const steps: DraftStep[] = (Array.isArray(o.steps) ? (o.steps as unknown[]) : []).flatMap((s): DraftStep[] => {
    if (typeof s === 'string') return [{ text: s, expect: '' }];
    if (typeof s === 'object' && s !== null) {
      const r = s as Record<string, unknown>;
      return [{ text: typeof r.step === 'string' ? r.step : '', expect: typeof r.expect === 'string' ? r.expect : '' }];
    }
    return [];
  });
  return {
    name: typeof o.flow === 'string' ? o.flow : '',
    start: typeof o.start === 'string' ? o.start : '',
    login: typeof o.login === 'string' ? o.login : '',
    tags: strings(o.tags),
    steps: steps.length ? steps : [{ text: '', expect: '' }],
    variations: strings(o.variations),
  };
}
