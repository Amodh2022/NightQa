import type { Settings } from './settings';
import { reportingFor } from './settings';

export interface RunProfile {
  readonly network: Settings['profiles']['network'];
  readonly screen: Settings['profiles']['screen'];
}

/** The profile a flow runs under: its own, else the default. */
export function profileFor(settings: Settings, flowFile: string): RunProfile {
  return settings.profiles.perFlow[flowFile] ?? { network: settings.profiles.network, screen: settings.profiles.screen };
}

/** Engine flags that come from settings (never from a request): blocked pages and actions, and the device profile. */
export function settingsFlags(settings: Settings, flowFile: string): string[] {
  const p = profileFor(settings, flowFile);
  return [
    ...settings.autonomy.blockedPaths.flatMap((x) => ['--block-path', x]),
    ...settings.autonomy.blockedActions.flatMap((x) => ['--block-action', x]),
    ...(p.network !== 'none' ? ['--network', p.network] : []),
    ...(p.screen !== 'desktop' ? ['--screen', p.screen] : []),
  ];
}

export interface SecretLookup {
  /** Decrypted value, or undefined. */
  (name: string): Promise<string | undefined>;
}

/**
 * Environment for the engine process, from settings plus vault secrets. GitHub is only configured when the
 * autonomy level allows filing issues; at L0 NightQA proves bugs and keeps them local.
 */
export async function engineEnv(settings: Settings, secret: SecretLookup, loginAccount: string | undefined, publicUrl?: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {
    NIGHTQA_MAX_STEPS: String(settings.budgets.maxSteps),
    NIGHTQA_MAX_SECONDS: String(settings.budgets.maxSeconds),
    NIGHTQA_MAX_COST_USD: String(settings.budgets.maxCostUsd),
    NIGHTQA_MIN_SEVERITY: settings.github.minSeverity,
    NIGHTQA_MAX_FIX_PRS: String(settings.github.maxFixPerNight),
  };
  const reporting = reportingFor(settings.autonomy.level);
  env.NIGHTQA_FIX_PRS = reporting.fixMode;
  if (publicUrl) env.NIGHTQA_PUBLIC_URL = publicUrl;
  const token = await secret('github:token');
  if (reporting.file && settings.github.repo && token) {
    env.NIGHTQA_GITHUB_REPO = settings.github.repo;
    env.GITHUB_TOKEN = token;
  }
  if (loginAccount) {
    const user = await secret(`account:${loginAccount}:username`);
    const pass = await secret(`account:${loginAccount}:password`);
    const key = loginAccount.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    if (user && pass) {
      env[`NIGHTQA_ACCOUNT_${key}_USERNAME`] = user;
      env[`NIGHTQA_ACCOUNT_${key}_PASSWORD`] = pass;
    }
  }
  return env;
}
