import { z } from 'zod';
import type { Settings } from './settings';
import type { SettingsRoute } from './settings-route';

const entry = z.string().trim().min(1, 'Entries cannot be empty.').max(200, 'Entries are limited to 200 characters.');

/**
 * What the Autonomy screen may change. There is deliberately no auto-merge option: L3 and above do not exist,
 * so a request that asks for them fails validation.
 */
export const autonomyBody = z
  .object({
    level: z.enum(['L0', 'L1', 'L2']).optional(),
    paused: z.boolean().optional(),
    blockedPaths: z.array(entry).max(50).optional(),
    blockedActions: z.array(entry).max(50).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'Nothing to change.');
export type AutonomyBody = z.infer<typeof autonomyBody>;

const unique = (xs: readonly string[]): string[] => [...new Set(xs)];

export function describeAutonomy(b: AutonomyBody, before: Settings): string {
  const parts: string[] = [];
  if (b.level && b.level !== before.autonomy.level) parts.push(`level ${before.autonomy.level} to ${b.level}`);
  if (b.paused !== undefined && b.paused !== before.autonomy.paused) parts.push(b.paused ? 'paused all runs' : 'resumed runs');
  if (b.blockedPaths) parts.push(`blocked pages: ${unique(b.blockedPaths).join(', ') || 'none'}`);
  if (b.blockedActions) parts.push(`blocked actions: ${unique(b.blockedActions).join(', ') || 'none'}`);
  return parts.join('; ') || 'no change';
}

export const autonomyRoute: SettingsRoute<AutonomyBody> = {
  schema: autonomyBody,
  action: 'autonomy.update',
  toPatch: (b) => ({
    autonomy: {
      ...(b.level ? { level: b.level } : {}),
      ...(b.paused !== undefined ? { paused: b.paused } : {}),
      ...(b.blockedPaths ? { blockedPaths: unique(b.blockedPaths) } : {}),
      ...(b.blockedActions ? { blockedActions: unique(b.blockedActions) } : {}),
    },
  }),
  describe: describeAutonomy,
};
