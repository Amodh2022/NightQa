/**
 * Eval harness: runs flows against the bug zoo and reports precision and recall.
 *
 *   pnpm eval:pipeline            scripted stand-in for the model, no key needed (CI): checks the engine plumbing
 *   pnpm eval                     the real model (needs ANTHROPIC_API_KEY and the NIGHTQA_* settings)
 *   add --update-baseline         write the committed baseline from this run
 *
 * Every bug case runs the shop with exactly ONE seeded bug so a finding is attributed exactly; clean cases run
 * with no bugs, where any bug report is a false alarm.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { BUG_CATALOG } from '../zoo/bugs.js';
import { ZooCheckoutAi } from '../zoo/scripted-ai.js';
import { startZoo } from '../zoo/server.js';
import { executeRun } from '../src/app/execute-run.js';
import { loadAiEnv, loadBudgets } from '../src/core/env.js';
import {
  compareToBaseline,
  computeMetrics,
  type Baseline,
  type EvalCaseResult,
} from '../src/core/eval-metrics.js';
import type { AiClient } from '../src/core/ports.js';
import { AnthropicAiClient } from '../src/io/anthropic-client.js';
import { loadFlowFile } from '../src/io/load-flow.js';

interface EvalCase {
  readonly id: string;
  readonly kind: 'bug' | 'clean';
  readonly bugId?: string;
  readonly flow: string;
  readonly zooBugs: string;
  /** Can the scripted stand-in play this flow? Only the checkout flow is scripted. */
  readonly scripted: boolean;
}

const BUG_FLOWS: Record<string, string> = {
  B01: 'flows/zoo/coupon.yaml',
  B02: 'flows/zoo/cart-quantity.yaml',
  B03: 'flows/zoo/wishlist.yaml',
  B04: 'flows/zoo/search.yaml',
  B05: 'flows/zoo/footer.yaml',
  B06: 'flows/zoo/orders.yaml',
  B07: 'flows/zoo/reviews.yaml',
  B08: 'flows/checkout.yaml',
  B09: 'flows/checkout.yaml',
  B10: 'flows/checkout.yaml',
};

const CASES: readonly EvalCase[] = [
  ...BUG_CATALOG.map((b) => ({
    id: `${b.id} ${b.title}`,
    kind: 'bug' as const,
    bugId: b.id,
    flow: BUG_FLOWS[b.id] ?? '',
    zooBugs: b.id,
    scripted: BUG_FLOWS[b.id] === 'flows/checkout.yaml',
  })),
  ...[...new Set(Object.values(BUG_FLOWS))].map((flow) => ({
    id: `clean: ${flow}`,
    kind: 'clean' as const,
    flow,
    zooBugs: 'none',
    scripted: flow === 'flows/checkout.yaml',
  })),
];

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'scripted' },
      'update-baseline': { type: 'boolean', default: false },
    },
  });
  const mode = values.mode === 'real' ? 'real' : 'scripted';
  if (existsSync('.env')) process.loadEnvFile('.env');
  const budgets = loadBudgets(process.env);
  const ai: AiClient =
    mode === 'real' ? new AnthropicAiClient(loadAiEnv(process.env)) : new ZooCheckoutAi();
  const cases = CASES.filter((c) => mode === 'real' || c.scripted);
  const resultsDir = await mkdtemp(join(tmpdir(), 'nightqa-eval-'));

  const results: EvalCaseResult[] = [];
  let usd = 0;
  for (const c of cases) {
    const zoo = await startZoo({ bugs: new Set(c.zooBugs === 'none' ? [] : [c.zooBugs]) });
    try {
      const { flow } = await loadFlowFile(c.flow);
      const out = await executeRun({
        url: zoo.url,
        flow,
        flowSource: c.flow,
        resultsDir,
        budgets,
        ai,
        policy: { allowPrivateNetwork: true },
        secrets: [],
        minRequestIntervalMs: 0,
      });
      usd += out.result.cost.usd;
      results.push({
        id: c.id,
        kind: c.kind,
        verdict: out.result.verdict,
        ...(c.bugId ? { bugId: c.bugId } : {}),
      });
      console.log(`${out.result.verdict.padEnd(12)} ${c.id}${c.kind === 'bug' ? '' : ''}`);
    } finally {
      await zoo.close();
    }
  }

  const metrics = computeMetrics(results, BUG_CATALOG.length);
  console.log(`\nmode: ${mode}   cases: ${String(cases.length)}   cost: $${usd.toFixed(4)}`);
  console.log(
    `precision: ${String(metrics.precision)} (${String(metrics.correctReports)}/${String(metrics.reports)} reports correct)`,
  );
  console.log(
    `recall:    ${String(metrics.recall)} (${String(metrics.bugsFound)}/${String(metrics.seededBugs)} seeded bugs found)`,
  );
  await mkdir('eval', { recursive: true });
  await writeFile(
    join('eval', 'last-run.json'),
    `${JSON.stringify({ mode, metrics, results }, null, 2)}\n`,
  );

  const baselinePath = join('eval', `baseline.${mode}.json`);
  if (values['update-baseline']) {
    const b: Baseline = { precision: metrics.precision, recall: metrics.recall };
    await writeFile(baselinePath, `${JSON.stringify(b, null, 2)}\n`);
    console.log(`baseline written: ${baselinePath}`);
    return 0;
  }
  if (!existsSync(baselinePath)) {
    console.error(
      `No committed baseline at ${baselinePath}. Run with --update-baseline once and commit it.`,
    );
    return 1;
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
  const gate = compareToBaseline(metrics, baseline);
  if (!gate.ok) {
    console.error(`\nEVAL GATE FAILED:\n${gate.failures.map((f) => `  - ${f}`).join('\n')}`);
    return 1;
  }
  console.log(
    `eval gate passed (baseline precision ${String(baseline.precision)}, recall ${String(baseline.recall)})`,
  );
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 2;
  },
);
