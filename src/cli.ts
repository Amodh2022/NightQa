#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { executeRun } from './app/execute-run.js';
import { loadAiEnv, loadBudgets } from './core/env.js';
import { EnvError, FlowValidationError } from './core/errors.js';
import { formatSummary } from './core/summary.js';
import { UrlPolicyError, checkTestUrl } from './core/url-policy.js';
import { loadFlowFile } from './io/load-flow.js';
import { AnthropicAiClient } from './io/anthropic-client.js';

const USAGE = `NightQA - self-healing QA agent

Usage:
  nightqa run --url <staging-url> --flow <flow.yaml> [options]

Options:
  --url <url>               Staging app to test (required)
  --flow <file>             Flow file (required)
  --results <dir>           Where evidence is written (default ./results)
  --allow-production        Allow production-looking URLs (off by default: staging only)
  --allow-private-network   Allow loopback/private targets such as a local demo app
  --headed                  Show the browser window
  -h, --help                Show this help

Environment: see .env.example. Test accounts: NIGHTQA_ACCOUNT_<NAME>_USERNAME / _PASSWORD.
Exit codes: 0 pass, 1 bug found, 2 usage or config error, 3 needs_setup / agent_stuck.`;

function accountFor(name: string | undefined): { username: string; password: string } | undefined {
  if (!name) return undefined;
  const key = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const username = process.env[`NIGHTQA_ACCOUNT_${key}_USERNAME`];
  const password = process.env[`NIGHTQA_ACCOUNT_${key}_PASSWORD`];
  return username && password ? { username, password } : undefined;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      flow: { type: 'string' },
      results: { type: 'string', default: 'results' },
      'allow-production': { type: 'boolean', default: false },
      'allow-private-network': { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help || positionals[0] !== 'run') {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  if (!values.url || !values.flow) {
    console.error('Both --url and --flow are required.\n');
    console.error(USAGE);
    return 2;
  }
  if (existsSync('.env')) process.loadEnvFile('.env');

  try {
    const policy = {
      allowProduction: values['allow-production'],
      allowPrivateNetwork: values['allow-private-network'],
    };
    checkTestUrl(values.url, policy); // fail fast: staging only, no SSRF targets
    const { flow, warnings } = await loadFlowFile(values.flow);
    for (const w of warnings)
      console.warn(`warning: ${values.flow}:${String(w.line)} ${w.message}`);
    const aiEnv = loadAiEnv(process.env);
    const budgets = loadBudgets(process.env);
    const account = accountFor(flow.login);
    const secrets = [aiEnv.apiKey, ...(account ? [account.password] : [])];

    const abort = new AbortController();
    const stop = (): void => {
      if (abort.signal.aborted) process.exit(130);
      console.error('\nStopping after the current step (press Ctrl+C again to force)...');
      abort.abort();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    const outcome = await executeRun({
      url: values.url,
      flow,
      flowSource: values.flow,
      resultsDir: values.results,
      budgets,
      ai: new AnthropicAiClient(aiEnv),
      policy,
      ...(account ? { account } : {}),
      secrets,
      signal: abort.signal,
      headless: !values.headed,
    });
    console.log(formatSummary(outcome.result, outcome.dir));
    return outcome.exitCode;
  } catch (e) {
    if (e instanceof FlowValidationError) {
      console.error(e.message);
    } else if (e instanceof EnvError || e instanceof UrlPolicyError) {
      console.error(e.message);
    } else {
      throw e;
    }
    return 2;
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
