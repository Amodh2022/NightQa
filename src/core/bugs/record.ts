import { z } from 'zod';

export const BUG_STATUSES = [
  'reported',
  'ready',
  'needs_look',
  'discarded',
  'below_threshold',
  'test_not_proven',
  'not_investigated',
] as const;

/**
 * reported         filed on GitHub
 * ready            proven (3/3 replays + a failing test that ran and failed) but not filed
 * needs_look       flaky: reproduced only some of the time, never filed
 * discarded        did not reproduce
 * below_threshold  proven, but under the team's severity level
 * test_not_proven  reproduced, but no failing test could be proven, so it is never filed
 * not_investigated over the per-run cap
 */
export const bugStatusSchema = z.enum(BUG_STATUSES);
export type BugStatus = z.infer<typeof bugStatusSchema>;

export const bugRecordSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().min(1),
  runId: z.string().min(1),
  flow: z.string(),
  title: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: bugStatusSchema,
  statusNote: z.string(),
  reproduced: z.number().int().min(0),
  attempts: z.number().int().min(0),
  recipe: z.array(z.string()),
  expected: z.string(),
  actual: z.string(),
  evidence: z.array(z.string()),
  test: z.strictObject({ file: z.string(), repoPath: z.string(), proven: z.boolean() }).optional(),
  issue: z
    .strictObject({
      number: z.number().int(),
      url: z.string(),
      state: z.enum(['open', 'closed']),
      action: z.enum(['created', 'seen_again']),
    })
    .optional(),
  fix: z
    .strictObject({
      status: z.enum(['requested', 'already_requested', 'skipped']),
      note: z.string().optional(),
    })
    .optional(),
  pull: z
    .strictObject({
      number: z.number().int(),
      url: z.string(),
      state: z.enum(['open', 'merged', 'closed']),
    })
    .optional(),
  closeReason: z.enum(['wrong_fix', 'not_a_bug', 'wont_fix']).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BugRecord = z.infer<typeof bugRecordSchema>;
