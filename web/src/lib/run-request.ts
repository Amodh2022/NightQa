import { z } from 'zod';
import { PERSONAS } from './settings';

/** Body of POST /api/runs: a flow run or replay, or an exploration run as one persona. */
export const runRequest = z.discriminatedUnion('mode', [
  z.object({ mode: z.enum(['run', 'replay']), flowFile: z.string().min(1).max(300) }),
  z.object({ mode: z.literal('explore'), persona: z.enum(PERSONAS) }),
]);
export type RunRequest = z.infer<typeof runRequest>;
