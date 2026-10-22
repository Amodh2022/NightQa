import { resolve } from 'node:path';

/** The repo root that holds the engine, flows/, tests/nightqa and results/. The web app lives in <root>/web. */
export function repoRoot(): string {
  return process.env.NIGHTQA_REPO_ROOT ? resolve(process.env.NIGHTQA_REPO_ROOT) : resolve(process.cwd(), '..');
}

export const resultsDir = (): string => resolve(process.env.NIGHTQA_RESULTS_DIR ?? resolve(repoRoot(), 'results'));
export const flowsDir = (): string => resolve(repoRoot(), 'flows');
export const testsDir = (): string => resolve(process.env.NIGHTQA_TESTS_DIR ?? resolve(repoRoot(), 'tests', 'nightqa'));

/** The staging app NightQA tests from the dashboard. */
export const targetUrl = (): string => process.env.NIGHTQA_TARGET_URL ?? 'http://127.0.0.1:4010';

/** Passing --allow-private-network is the operator's explicit consent, given in the dashboard's env. */
export const allowPrivateNetwork = (): boolean => process.env.NIGHTQA_ALLOW_PRIVATE_NETWORK === '1';

/** Where the dashboard keeps its own state (settings, encrypted secrets, audit log). Never inside results/. */
export const dataDir = (): string => resolve(process.env.NIGHTQA_DATA_DIR ?? resolve(repoRoot(), 'data'));
