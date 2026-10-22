#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { accountFor } from './app/accounts.js';
import { executeReplay } from './app/execute-replay.js';
import { executeRun } from './app/execute-run.js';
import { investigateRun, type GitHubTarget } from './app/investigate.js';
import { syncBugs } from './app/sync-bugs.js';
import { createRunLogger } from './io/logger.js';
import { FileFixLedger } from './io/fix-ledger.js';
import { OctokitGitHub } from './io/github-octokit.js';
import { loadAiEnv, loadBudgets, loadReportEnv, type ReportEnv } from './core/env.js';
import { EnvError, FlowValidationError, GitHubError } from './core/errors.js';
import { exploreFlow, personaSchema, type Persona } from './core/personas.js';
import { readCoverage } from './io/coverage.js';
import {
  DEFAULT_PROFILE,
  networkNameSchema,
  screenNameSchema,
  type RunProfile,
} from './core/profiles.js';
import type { RunResult } from './core/agent/loop.js';
import type { Flow } from './core/flow/schema.js';
import type { Account } from './core/redact.js';
import type { DriverArtifacts } from './core/ports.js';
import { buildRecording, flowFromRecording, parseRecording } from './core/recording.js';
import { exitCodeFor, formatSummary } from './core/summary.js';
import { UrlPolicyError, checkTestUrl, type UrlPolicyOptions } from './core/url-policy.js';
import { createAiClient } from './io/create-ai-client.js';
import { loadFlowFile } from './io/load-flow.js';
import { saveRegressionTest } from './io/save-test.js';

const USAGE = `NightQA - self-healing QA agent

Usage:
  nightqa run --url <staging-url> --flow <flow.yaml> [options]
  nightqa replay --url <staging-url> --test <recording.json | folder> [options]
  nightqa explore --url <staging-url> --persona <name>   wander the app as a kind of user, looking for bugs
  nightqa sync                    refresh filed bugs from GitHub (issue state, fix pull requests)
  nightqa check-flow <flow.yaml>  validate a flow file with the engine's rules (exit 0 valid, 2 invalid)

Options:
  --url <url>               Staging app to test (required)
  --flow <file>             Flow file (run)
  --test <path>             A saved *.recording.json, or a folder of them (replay)
  --tests-dir <dir>         Where passing runs are saved as regression tests (default ./tests/nightqa)
  --no-save                 Do not save a passing run as a regression test
  --no-investigate          Do not reproduce, prove or file the bugs a run finds
  --repo <owner/name>       File proven bugs here (or NIGHTQA_GITHUB_REPO; the token is GITHUB_TOKEN)
  --run-id <id>             Use this id for the results folder (the dashboard sets it)
  --results <dir>           Where evidence is written (default ./results)
  --persona <name>          Who explores: first-time-buyer | returning-user | careless-typer | impatient-clicker | keyboard-only
  --network <name>          Test under a network: fast-4g | slow-4g | fast-3g | slow-3g (default: none)
  --screen <name>           Test on a screen: desktop | laptop | tablet | iphone | android | android-small
  --block-path <prefix>     Never visit pages under this path (repeatable)
  --block-action <text>     Never click anything whose name contains this (repeatable)
  --allow-production        Allow production-looking URLs (off by default: staging only)
  --allow-private-network   Allow loopback/private targets such as a local demo app
  --headed                  Show the browser window
  -h, --help                Show this help

"run" uses the AI (see .env.example). "replay" makes no AI calls and costs nothing.
A bug is filed only after it reproduced 3 of 3 times and a failing test ran and failed.
Reporting: NIGHTQA_MIN_SEVERITY (medium), NIGHTQA_FIX_PRS (auto|manual|off), NIGHTQA_MAX_FIX_PRS (3).
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
      'no-investigate': { type: 'boolean', default: false },
      repo: { type: 'string' },
      'run-id': { type: 'string' },
      results: { type: 'string', default: 'results' },
      persona: { type: 'string' },
      network: { type: 'string' },
      screen: { type: 'string' },
      'block-path': { type: 'string', multiple: true },
      'block-action': { type: 'string', multiple: true },
      'allow-production': { type: 'boolean', default: false },
      'allow-private-network': { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
}

function profileFrom(values: Values, fallback: RunProfile = DEFAULT_PROFILE): RunProfile {
  const network =
    values.network === undefined ? fallback.network : networkNameSchema.safeParse(values.network);
  const screen =
    values.screen === undefined ? fallback.screen : screenNameSchema.safeParse(values.screen);
  if (typeof network === 'object' && !network.success)
    throw new EnvError([`--network: must be one of ${networkNameSchema.options.join(', ')}`]);
  if (typeof screen === 'object' && !screen.success)
    throw new EnvError([`--screen: must be one of ${screenNameSchema.options.join(', ')}`]);
  return {
    network: typeof network === 'object' ? network.data : network,
    screen: typeof screen === 'object' ? screen.data : screen,
  };
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

async function runCommand(
  values: Values,
  url: string,
  policy: UrlPolicyOptions,
  explore?: Persona,
): Promise<number> {
  if (!explore && !values.flow) {
    console.error('--flow is required for "run".\n');
    console.error(USAGE);
    return 2;
  }
  const budgets = loadBudgets(process.env);
  const known = explore ? Object.keys((await readCoverage(values.results)).pages) : [];
  const loaded = explore
    ? { flow: exploreFlow(explore, known, Math.ceil(budgets.maxSteps / 8)), warnings: [] }
    : await loadFlowFile(values.flow ?? '');
  const { flow, warnings } = loaded;
  const flowSource = explore ? `explore:${explore}` : (values.flow ?? '');
  for (const w of warnings) console.warn(`warning: ${flowSource}:${String(w.line)} ${w.message}`);
  const aiEnv = loadAiEnv(process.env);
  const account = accountFor(flow.login, process.env);
  const secrets = [aiEnv.apiKey, ...(account ? [account.password] : [])];
  const profile = profileFrom(values);
  const blockedPaths = values['block-path'] ?? [];
  const blockedActions = values['block-action'] ?? [];

  const outcome = await executeRun({
    url,
    flow,
    flowSource,
    resultsDir: values.results,
    budgets,
    ai: createAiClient(aiEnv),
    policy,
    ...(account ? { account } : {}),
    secrets,
    signal: installSignalHandlers(),
    headless: !values.headed,
    profile,
    ...(explore ? { explore: { persona: explore } } : {}),
    ...(blockedPaths.length ? { blockedPaths } : {}),
    ...(blockedActions.length ? { blockedActions } : {}),
    ...(values['run-id'] ? { runId: values['run-id'] } : {}),
  });
  console.log(formatSummary(outcome.result, outcome.dir));

  if (outcome.result.verdict === 'pass' && !values['no-save'] && !explore) {
    const rec = buildRecording(outcome.result, flow, {
      flowSource,
      createdAt: new Date().toISOString(),
      profile,
    });
    const saved = await saveRegressionTest(values['tests-dir'], rec);
    console.log(
      saved.saved
        ? `  saved regression test: ${saved.specPath}\n  replay with: nightqa replay --url ${url} --test ${saved.recordingPath}`
        : `  regression test already exists (kept as is): ${saved.recordingPath}`,
    );
  }
  if (outcome.result.verdict === 'bug' && !values['no-investigate']) {
    await investigate(values, {
      url,
      result: outcome.result,
      flow,
      artifacts: outcome.artifacts,
      policy,
      account,
      secrets,
      profile,
      blockedPaths,
    });
  }
  return outcome.exitCode;
}

interface InvestigateInput {
  readonly url: string;
  readonly result: RunResult;
  readonly flow: Flow;
  readonly artifacts: DriverArtifacts;
  readonly policy: UrlPolicyOptions;
  readonly account: Account | undefined;
  readonly secrets: readonly string[];
  readonly profile: RunProfile;
  readonly blockedPaths: readonly string[];
}

/** Takes a run's bugs through the proof gates and prints where each one ended up. */
async function investigate(values: Values, i: InvestigateInput): Promise<void> {
  const report = loadReportEnv({
    ...process.env,
    ...(values.repo ? { NIGHTQA_GITHUB_REPO: values.repo } : {}),
  });
  const github = githubTarget(report, values.results);
  const bugSecrets = [...i.secrets, ...(report.token ? [report.token] : [])];
  const records = await investigateRun({
    url: i.url,
    result: i.result,
    flow: i.flow,
    artifacts: i.artifacts,
    resultsDir: values.results,
    testsDir: values['tests-dir'],
    minSeverity: report.minSeverity,
    maxBugs: report.maxBugsPerRun,
    ...(github ? { github } : {}),
    ...(report.evidenceBaseUrl ? { evidenceBaseUrl: report.evidenceBaseUrl } : {}),
    policy: i.policy,
    ...(i.account ? { account: i.account } : {}),
    secrets: bugSecrets,
    headless: !values.headed,
    profile: i.profile,
    ...(i.blockedPaths.length ? { blockedPaths: i.blockedPaths } : {}),
    log: createRunLogger(i.result.runId, bugSecrets),
  });
  for (const r of records) {
    console.log(
      `  bug ${r.id} [${r.severity}] ${r.status}: ${r.title}${r.issue ? ` -> ${r.issue.url}` : ''}${r.statusNote ? ` (${r.statusNote})` : ''}`,
    );
  }
}

function githubTarget(report: ReportEnv, resultsDir: string): GitHubTarget | undefined {
  if (!report.repo || !report.token) return undefined;
  return {
    port: new OctokitGitHub({ token: report.token, repo: report.repo }),
    ledger: new FileFixLedger(join(resultsDir, '.nightqa', 'fix-requests.json')),
    policy: {
      fixMode: report.fixMode,
      maxFixPerNight: report.maxFixPerNight,
      fixMinSeverity: 'high',
    },
  };
}

async function syncCommand(values: Values): Promise<number> {
  const report = loadReportEnv({
    ...process.env,
    ...(values.repo ? { NIGHTQA_GITHUB_REPO: values.repo } : {}),
  });
  if (!report.repo || !report.token) {
    console.error('sync needs a repository (--repo or NIGHTQA_GITHUB_REPO) and GITHUB_TOKEN.');
    return 2;
  }
  const r = await syncBugs(
    values.results,
    new OctokitGitHub({ token: report.token, repo: report.repo }),
    [report.token],
  );
  console.log(`Checked ${String(r.checked)} filed bug(s), updated ${String(r.updated)}.`);
  return 0;
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
      profile: profileFrom(values, recording.profile),
      ...((values['block-path'] ?? []).length ? { blockedPaths: values['block-path'] ?? [] } : {}),
      ...(values['run-id'] && files.length === 1 ? { runId: values['run-id'] } : {}),
    });
    console.log(formatSummary(outcome.result, outcome.dir));
    if (outcome.flaky) console.log('  note: failed once, passed on retry (flaky)');
    if (outcome.result.verdict === 'bug' && !values['no-investigate']) {
      await investigate(values, {
        url,
        result: outcome.result,
        flow: flowFromRecording(recording),
        artifacts: outcome.artifacts,
        policy,
        account,
        secrets: account ? [account.password] : [],
        profile: profileFrom(values, recording.profile),
        blockedPaths: values['block-path'] ?? [],
      });
    }
    worst = Math.max(worst, exitCodeFor(outcome.result.verdict));
  }
  return worst;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parse(argv);
  const command = positionals[0];
  if (
    values.help ||
    (command !== 'run' &&
      command !== 'replay' &&
      command !== 'sync' &&
      command !== 'explore' &&
      command !== 'check-flow')
  ) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  if (command === 'check-flow') {
    const file = positionals[1];
    if (!file) {
      console.error('Usage: nightqa check-flow <flow.yaml>');
      return 2;
    }
    try {
      const { flow, warnings } = await loadFlowFile(file);
      for (const w of warnings) console.log(`warning: line ${String(w.line)}: ${w.message}`);
      console.log(`OK: "${flow.flow}" has ${String(flow.steps.length)} steps`);
      return 0;
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      return 2;
    }
  }
  if (command === 'sync') {
    if (existsSync('.env')) process.loadEnvFile('.env');
    try {
      return await syncCommand(values);
    } catch (e) {
      if (e instanceof EnvError || e instanceof GitHubError) {
        console.error(e.message);
        return 2;
      }
      throw e;
    }
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
    if (command === 'explore') {
      const persona = personaSchema.safeParse(values.persona);
      if (!persona.success) {
        console.error(`--persona must be one of: ${personaSchema.options.join(', ')}`);
        return 2;
      }
      return await runCommand(values, values.url, policy, persona.data);
    }
    return command === 'run'
      ? await runCommand(values, values.url, policy)
      : await replayCommand(values, values.url, policy);
  } catch (e) {
    if (
      e instanceof FlowValidationError ||
      e instanceof EnvError ||
      e instanceof UrlPolicyError ||
      e instanceof GitHubError
    ) {
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
