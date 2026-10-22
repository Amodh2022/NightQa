import { z } from 'zod';
import { NETWORKS, PERSONAS, SCREENS, type Settings } from './settings';
import type { SettingsRoute } from './settings-route';

const profile = z.object({ network: z.enum(NETWORKS), screen: z.enum(SCREENS) }).strict();

/** Default profile plus the complete per-flow override map (an absent flow means "use the default"). */
export const profilesBody = z
  .object({
    network: z.enum(NETWORKS),
    screen: z.enum(SCREENS),
    perFlow: z.record(z.string().min(1).max(300).regex(/^flows\/[^\0]+\.ya?ml$/, 'Overrides are keyed by a flow file under flows/.'), profile),
  })
  .strict();
export type ProfilesBody = z.infer<typeof profilesBody>;

export const profilesRoute: SettingsRoute<ProfilesBody> = {
  schema: profilesBody,
  action: 'profiles.update',
  toPatch: (b) => ({ profiles: { network: b.network, screen: b.screen, perFlow: b.perFlow } }),
  describe: (b, before: Settings) => `default ${before.profiles.network}/${before.profiles.screen} to ${b.network}/${b.screen}; ${String(Object.keys(b.perFlow).length)} per-flow override(s)`,
};

export const explorationBody = z
  .object({
    enabled: z.boolean(),
    personas: z.array(z.enum(PERSONAS)).max(PERSONAS.length),
    maxSteps: z.number().int().min(5).max(100),
  })
  .strict();
export type ExplorationBody = z.infer<typeof explorationBody>;

export const explorationRoute: SettingsRoute<ExplorationBody> = {
  schema: explorationBody,
  action: 'exploration.update',
  toPatch: (b) => ({ exploration: { enabled: b.enabled, personas: [...new Set(b.personas)], maxSteps: b.maxSteps } }),
  describe: (b) => `exploration ${b.enabled ? 'on' : 'off'}; personas: ${b.personas.join(', ') || 'none'}; ${String(b.maxSteps)} steps`,
};
