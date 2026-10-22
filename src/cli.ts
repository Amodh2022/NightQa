#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { accountFor } from './app/accounts.js';
import { executeReplay } from './app/execute-replay.js';
import { executeRun } from './app/execute-run.js';
import { loadAiEnv, loadBudgets } from './core/env.js';
import { EnvError, FlowValidationError } from './core/errors.js';
import { buildRecording, parseRecording } from './core/recording.js';
import { exitCodeFor, formatSummary } from './core/summary.js';
import { UrlPolicyError, checkTestUrl, type UrlPolicyOptions } from './core/url-policy.js';
import { AnthropicAiClient } from './io/anthropic-client.js';
import { loadFlowFile } from './io/load-flow.js';
import { saveRegressionTest } from './io/save-test.js';

const USAGE = `NightQA - self-healing QA agent

Usage:
  nightqa run --url <staging-url> --flow <flow.yaml> [options]
  nightqa replay --url <staging-url> --test <recording.json | folder> [options]

Options:
  --url <url>               Staging app to test (required)
  --flow <file>             Flow file (run)
  --test <path>             A saved *.recording.json, or a folder of them (replay)
  --tests-dir <dir>         Where passing runs are saved as regression tests (default ./tests/nightqa)
  --no-save                 Do not save a passing run as a regression test
  --results <dir>           Where evidence is written (default ./results)
  --allow-production        Allow production-looking URLs (off by default: staging only)
  --allow-private-network   Allow loopback/private targets such as a local demo app
  --headed                  Show the browser window
  -h, --help                Show this help

"run" uses the AI (see .env.example). "replay" makes no AI calls and costs nothing.
Test accounts: NIGHTQA_ACCOUNT_<NAME>_USERNAME / _PASSWORD.
Exit codes: 0 pass, 1 bug found, 2 usage or config error, 3 needs_setup / agent_stuck.`;

type Values = ReturnType<typeof parse>['values'];

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      flow: { type: 'string' },
      test: { type: 'string' },
      'tests-dir': { type: 'string', default: 'tests/nightqa' },
      'no-save': { type: 'boolean', default: false },
      results: { type: 'string', default: 'results' },
      'allow-production': { type: 'boolean', default: false },
      'allow-private-network': { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
}

function installSignalHandlers(): AbortSignal {
  const abort = new AbortController();
  const stop = (): void => {
    if (abort.signal.aborted) process.exit(130);
    console.error('\nStopping after the current step (press Ctrl+C again to force)...');
    abort.abort();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return abort.signal;
}

async function runCommand(values: Values, url: string, policy: UrlPolicyOptions): Promise<number> {
  if (!values.flow) {
    console.error('--flow is required for "run".\n');
    console.error(USAGE);
    return 2;
  }
  const { flow, warnings } = await loadFlowFile(values.flow);
  for (const w of warnings) console.warn(`warning: ${values.flow}:${String(w.line)} ${w.message}`);
  const aiEnv = loadAiEnv(process.env);
  const budgets = loadBudgets(process.env);
  const account = accountFor(flow.login, process.env);
  const secrets = [aiEnv.apiKey, ...(account ? [account.password] : [])];

  const outcome = await executeRun({
    url,
    flow,
    flowSource: values.flow,
    resultsDir: values.results,
    budgets,
    ai: new AnthropicAiClient(aiEnv),
    policy,
    ...(account ? { account } : {}),
    secrets,
    signal: installSignalHandlers(),
    headless: !values.headed,
  });
  console.log(formatSummary(outcome.result, outcome.dir));

  if (outcome.result.verdict === 'pass' && !values['no-save']) {
    const rec = buildRecording(outcome.result, flow, {
      flowSource: values.flow,
      createdAt: new Date().toISOString(),
    });
    const saved = await saveRegressionTest(values['tests-dir'], rec);
    console.log(
      saved.saved
        ? `  saved regression test: ${saved.specPath}\n  replay with: nightqa replay --url ${url} --test ${saved.recordingPath}`
        : `  regression test already exists (kept as is): ${saved.recordingPath}`,
    );
  }
  return outcome.exitCode;
}

async function findRecordings(path: string): Promise<string[]> {
  if ((await stat(path)).isDirectory()) {
    return (await readdir(path))
      .filter((f) => f.endsWith('.recording.json'))
      .sort()
      .map((f) => join(path, f));
  }
  return [path];
}

async function replayCommand(
  values: Values,
  url: string,
  policy: UrlPolicyOptions,
): Promise<number> {
  if (!values.test) {
    console.error('--test is required for "replay".\n');
    console.error(USAGE);
    return 2;
  }
  const files = await findRecordings(values.test);
  if (files.length === 0) {
    console.error(`No *.recording.json files found in ${values.test}`);
    return 2;
  }
  const budgets = loadBudgets(process.env);
  const signal = installSignalHandlers();
  let worst = 0;
  for (const file of files) {
    if (signal.aborted) break;
    const recording = parseRecording(await readFile(file, 'utf8'));
    const account = accountFor(recording.login, process.env);
    const outcome = await executeReplay({
      url,
      recording,
      recordingSource: file,
      resultsDir: values.results,
      budgets,
      policy,
      ...(account ? { account } : {}),
      secrets: account ? [account.password] : [],
      headless: !values.headed,
    });
    console.log(formatSummary(outcome.result, outcome.dir));
    if (outcome.flaky) console.log('  note: failed once, passed on retry (flaky)');
    worst = Math.max(worst, exitCodeFor(outcome.result.verdict));
  }
  return worst;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv);
  const command = positionals[0];
  if (values.help || (command !== 'run' && command !== 'replay')) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  if (!values.url) {
    console.error('--url is required.\n');
    console.error(USAGE);
    return 2;
  }
  if (existsSync('.env')) process.loadEnvFile('.env');

  const policy = {
    allowProduction: values['allow-production'],
    allowPrivateNetwork: values['allow-private-network'],
  };
  try {
    checkTestUrl(values.url, policy); // fail fast: staging only, no SSRF targets
    return command === 'run'
      ? await runCommand(values, values.url, policy)
      : await replayCommand(values, values.url, policy);
  } catch (e) {
    if (e instanceof FlowValidationError || e instanceof EnvError || e instanceof UrlPolicyError) {
      console.error(e.message);
      return 2;
    }
    throw e;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 2;
  },
);
