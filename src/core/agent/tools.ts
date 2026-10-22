import { z } from 'zod';
import type { RawToolCall, WaitCondition } from '../ports.js';

const ref = z.string().regex(/^e\d{1,3}$/, 'target must be an element ref like "e3"');

const click = z.strictObject({ target: ref });
const type = z.strictObject({ target: ref, text: z.string().max(500) });
const navigate = z.strictObject({ path: z.string().min(1).max(500) });
const scroll = z.strictObject({ direction: z.enum(['up', 'down', 'top', 'bottom']) });
const wait = z.strictObject({
  kind: z.enum(['text', 'idle', 'ms']),
  text: z.string().min(1).max(200).optional(),
  ms: z.number().int().min(100).max(5000).optional(),
});
const expectTool = z.strictObject({
  statement: z.string().min(1).max(400),
  result: z.enum(['pass', 'fail', 'unclear']),
  evidence: z.string().min(1).max(600),
  visible_text: z.array(z.string().min(1).max(160)).max(5).optional(),
  missing_text: z.array(z.string().min(1).max(160)).max(5).optional(),
  disabled_controls: z.array(z.string().min(1).max(160)).max(5).optional(),
});
const done = z.strictObject({ summary: z.string().min(1).max(600) });
const stuck = z.strictObject({ reason: z.string().min(1).max(600) });

const schemas = { click, type, navigate, scroll, wait, expect: expectTool, done, stuck } as const;

export type ToolName = keyof typeof schemas;

/** A tool call that passed validation. */
export type ToolCall =
  | { readonly name: 'click'; readonly input: z.infer<typeof click> }
  | { readonly name: 'type'; readonly input: z.infer<typeof type> }
  | { readonly name: 'navigate'; readonly input: z.infer<typeof navigate> }
  | { readonly name: 'scroll'; readonly input: z.infer<typeof scroll> }
  | { readonly name: 'wait'; readonly input: z.infer<typeof wait> }
  | { readonly name: 'expect'; readonly input: z.infer<typeof expectTool> }
  | { readonly name: 'done'; readonly input: z.infer<typeof done> }
  | { readonly name: 'stuck'; readonly input: z.infer<typeof stuck> };

export type ParsedToolCall = { ok: true; call: ToolCall } | { ok: false; error: string };

/** Validates a model tool call. Only the eight known tools are accepted. */
export function parseToolCall(raw: RawToolCall | undefined): ParsedToolCall {
  if (!raw) return { ok: false, error: 'the model did not call a tool' };
  if (!(raw.name in schemas)) return { ok: false, error: `unknown tool "${raw.name}"` };
  const name = raw.name as ToolName;
  const r = schemas[name].safeParse(raw.input);
  if (!r.success) {
    return { ok: false, error: `${name}: ${r.error.issues.map((i) => i.message).join('; ')}` };
  }
  if (name === 'wait') {
    const w = r.data as z.infer<typeof wait>;
    if (w.kind === 'text' && !w.text)
      return { ok: false, error: 'wait: text is required for kind "text"' };
    if (w.kind === 'ms' && w.ms === undefined)
      return { ok: false, error: 'wait: ms is required for kind "ms"' };
  }
  return { ok: true, call: { name, input: r.data } as ToolCall };
}

/** Converts a validated wait call into a driver wait condition. */
export function toWaitCondition(input: z.infer<typeof wait>): WaitCondition {
  if (input.kind === 'text') return { kind: 'text', text: input.text ?? '' };
  if (input.kind === 'ms') return { kind: 'ms', ms: input.ms ?? 1000 };
  return { kind: 'idle' };
}

interface ToolDef {
  readonly name: ToolName;
  readonly description: string;
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
}

const REF_PROP = {
  type: 'string',
  description: 'Element ref from the current element list, such as "e3"',
};

/** The only tools the model may call. JSON schemas are sent to the API; Zod above is the real gate. */
export const TOOL_DEFS: readonly ToolDef[] = [
  {
    name: 'click',
    description: 'Click a visible element.',
    properties: { target: REF_PROP },
    required: ['target'],
  },
  {
    name: 'type',
    description:
      'Type text into a field (replaces its content). For logins use the placeholders {{account.username}} and {{account.password}}, never real credentials.',
    properties: { target: REF_PROP, text: { type: 'string' } },
    required: ['target', 'text'],
  },
  {
    name: 'navigate',
    description: 'Go to a path on the app, such as /cart.',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
  {
    name: 'scroll',
    description: 'Scroll the page.',
    properties: { direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] } },
    required: ['direction'],
  },
  {
    name: 'wait',
    description: 'Wait for text to appear, for the network to go idle, or for a short time.',
    properties: {
      kind: { type: 'string', enum: ['text', 'idle', 'ms'] },
      text: { type: 'string', description: 'Text to wait for (kind "text")' },
      ms: { type: 'integer', description: '100 to 5000 (kind "ms")' },
    },
    required: ['kind'],
  },
  {
    name: 'expect',
    description:
      'Judge the current step from visible evidence. Use it when the step is complete: state a precise checkable statement, the result (pass, fail or unclear) and the evidence you can see.',
    properties: {
      statement: { type: 'string' },
      result: { type: 'string', enum: ['pass', 'fail', 'unclear'] },
      evidence: { type: 'string', description: 'What you can see that proves the result' },
      visible_text: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Required when result is pass: 1 to 3 short snippets copied exactly from the visible page text that prove it. They are re-checked against the page and saved as the regression test. When result is fail, the wrong text you can see (copied exactly).',
      },
      missing_text: {
        type: 'array',
        items: { type: 'string' },
        description:
          'When result is fail: 1 to 3 short snippets that the expectation says should be visible but are NOT on the page. A fail needs visible_text, missing_text, disabled_controls, or a mix: that proof is replayed to confirm the bug.',
      },
      disabled_controls: {
        type: 'array',
        items: { type: 'string' },
        description:
          'When result is fail: names of buttons or fields (exactly as listed in the interactive elements) that should be usable now but are disabled.',
      },
    },
    required: ['statement', 'result', 'evidence'],
  },
  {
    name: 'done',
    description: 'Finish the flow after every step is complete.',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
  },
  {
    name: 'stuck',
    description: 'Give up on the current step and say why.',
    properties: { reason: { type: 'string' } },
    required: ['reason'],
  },
];
