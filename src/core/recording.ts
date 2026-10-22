import { z } from 'zod';
import type { RunResult } from './agent/loop.js';
import type { Flow } from './flow/schema.js';

const target = z.discriminatedUnion('by', [
  z.strictObject({
    by: z.literal('role'),
    role: z.string().min(1),
    name: z.string(),
    nth: z.number().int().min(0),
  }),
  z.strictObject({ by: z.literal('label'), name: z.string().min(1), nth: z.number().int().min(0) }),
]);

const waitCondition = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('text'),
    text: z.string().min(1),
    timeoutMs: z.number().optional(),
  }),
  z.strictObject({ kind: z.literal('idle'), timeoutMs: z.number().optional() }),
  z.strictObject({ kind: z.literal('ms'), ms: z.number() }),
]);

const action = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('navigate'), path: z.string().min(1) }),
  z.strictObject({ kind: z.literal('click'), target }),
  z.strictObject({ kind: z.literal('type'), target, text: z.string() }),
  z.strictObject({ kind: z.literal('scroll'), direction: z.enum(['up', 'down', 'top', 'bottom']) }),
  z.strictObject({ kind: z.literal('wait'), condition: waitCondition }),
]);

const event = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('action'), stepIndex: z.number().int().min(0), action }),
  z.strictObject({
    type: z.literal('assert'),
    stepIndex: z.number().int().min(0),
    statement: z.string(),
    visibleText: z.array(z.string().min(1)).min(1),
  }),
]);

/** A passing run, saved so later nights can replay it with no AI calls. */
export const recordingSchema = z.strictObject({
  version: z.literal(1),
  flow: z.string().min(1),
  flowSource: z.string(),
  start: z.string().min(1),
  login: z.string().optional(),
  runId: z.string().min(1),
  createdAt: z.string(),
  steps: z.array(z.string()).min(1),
  events: z.array(event).min(1),
});

export type Recording = z.infer<typeof recordingSchema>;
export type RecordingEvent = Recording['events'][number];

/** URL-safe file name for a flow. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'flow';
}

/**
 * Builds a recording from a passing run: its actions and the evidence-backed assertions, interleaved in order.
 * @throws Error if the run did not pass (only passing runs become regression tests)
 */
export function buildRecording(
  result: RunResult,
  flow: Flow,
  meta: { flowSource: string; createdAt: string },
): Recording {
  if (result.verdict !== 'pass')
    throw new Error('Only a passing run can be saved as a regression test');
  const events: RecordingEvent[] = [];
  for (let i = 0; i <= result.actions.length; i++) {
    for (const a of result.assertions.filter((x) => x.afterActions === i)) {
      events.push({
        type: 'assert',
        stepIndex: a.stepIndex,
        statement: a.statement,
        visibleText: [...a.visibleText],
      });
    }
    const rec = result.actions[i];
    if (rec) events.push({ type: 'action', stepIndex: rec.stepIndex, action: rec.action });
  }
  return recordingSchema.parse({
    version: 1,
    flow: flow.flow,
    flowSource: meta.flowSource,
    start: flow.start,
    ...(flow.login !== undefined ? { login: flow.login } : {}),
    runId: result.runId,
    createdAt: meta.createdAt,
    steps: flow.steps.map((s) => s.text),
    events,
  });
}

/** Parses and validates a recording file's JSON. */
export function parseRecording(json: string): Recording {
  return recordingSchema.parse(JSON.parse(json));
}
