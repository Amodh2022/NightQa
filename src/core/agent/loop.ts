import type { Budgets } from '../env.js';
import { BudgetExceededError } from '../errors.js';
import type { Flow } from '../flow/schema.js';
import type {
  Action,
  AiClient,
  BrowserDriver,
  Clock,
  DriverSignal,
  Log,
  TargetSpec,
} from '../ports.js';
import { redactString, resolvePlaceholders, type Account } from '../redact.js';
import { findingKindFor } from '../signals.js';
import { decideVerdict, type Finding, type FindingKind, type Verdict } from '../verdict.js';
import { containsText } from '../text.js';
import { BudgetTracker } from './budget.js';
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserText, type StepStatus } from './prompts.js';
import { parseToolCall, toWaitCondition, type ToolCall } from './tools.js';

export interface RunDeps {
  readonly driver: BrowserDriver;
  readonly ai: AiClient;
  readonly clock: Clock;
  readonly log: Log;
  /** The saved test account for flows with `login:`. Values are never shown to the model. */
  readonly account?: Account;
  /** Every secret value to scrub from prompts, logs and results. */
  readonly secrets: readonly string[];
}

export interface RunOptions {
  readonly runId: string;
  readonly budgets: Budgets;
  readonly signal?: AbortSignal;
  /** Stop the run, as needs_setup, after this many 5xx responses. Default 5. */
  readonly maxServerErrors?: number;
}

export interface RecordedAction {
  readonly stepIndex: number;
  readonly action: Action;
}

/** An evidence-backed check that held at one point in the run. Replay re-checks it with no AI. */
export interface RecordedAssertion {
  readonly stepIndex: number;
  /** How many actions had been performed when it was made. */
  readonly afterActions: number;
  readonly statement: string;
  readonly visibleText: readonly string[];
}

export interface StepResult {
  readonly index: number;
  readonly text: string;
  readonly expect?: string;
  readonly status: StepStatus;
  readonly statement?: string;
  readonly evidence?: string;
  readonly screenshot?: string;
}

export interface CostSummary {
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly usd: number;
}

export interface RunResult {
  readonly runId: string;
  readonly flow: string;
  readonly verdict: Verdict;
  readonly reason: string;
  /** AI steps taken. */
  readonly steps: number;
  readonly durationSeconds: number;
  readonly cost: CostSummary;
  readonly stepResults: readonly StepResult[];
  readonly findings: readonly Finding[];
  /** Replayable browser actions, in order. Typed secrets appear as placeholders. */
  readonly actions: readonly RecordedAction[];
  readonly assertions: readonly RecordedAssertion[];
  readonly finalUrl: string;
  readonly promptVersion: string;
  readonly model: string;
}

const MAX_INVALID_IN_A_ROW = 3;
const MAX_FAILED_ACTIONS_IN_A_ROW = 3;

function describeTarget(t: TargetSpec): string {
  return t.by === 'label' ? `field "${t.name}"` : `${t.role} "${t.name}"`;
}

function shortError(e: unknown): string {
  const first = (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? 'error';
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

/**
 * The agent loop: LOOK (observe), THINK (ask the AI for one tool call), ACT (do it), CHECK (judge expectations).
 * Hard budgets apply; hitting one ends the run as agent_stuck. Page content is untrusted and only ever
 * appears in the prompt as fenced data.
 */
export async function runFlow(deps: RunDeps, flow: Flow, opts: RunOptions): Promise<RunResult> {
  const { driver, ai, log, secrets } = deps;
  const budget = new BudgetTracker(opts.budgets, deps.clock);
  const clean = (s: string): string => redactString(s, secrets);

  const results = flow.steps.map((s, i) => ({
    index: i,
    text: s.text,
    ...(s.expect !== undefined ? { expect: s.expect } : {}),
    status: 'pending',
  })) as {
    index: number;
    text: string;
    expect?: string;
    status: StepStatus;
    statement?: string;
    evidence?: string;
    screenshot?: string;
  }[];
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const actions: RecordedAction[] = [];
  const assertions: RecordedAssertion[] = [];
  const history: string[] = [];
  const cost = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
  const busyChecked = new Set<string>();

  let stepIndex = 0;
  let stuckReason: string | undefined;
  let setupProblem: string | undefined;
  let model = '';
  let url = '';
  let invalidStreak = 0;
  let failedActionStreak = 0;
  let rejectedPassStreak = 0;
  let newSignals: DriverSignal[] = [];

  const addFinding = (kind: FindingKind, message: string, at: string): void => {
    const key = `${kind}|${at}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ kind, message: clean(message), stepIndex, url: at });
  };

  const absorb = (signals: readonly DriverSignal[], at: string): void => {
    for (const s of signals) {
      const kind = findingKindFor(s);
      if (!kind) {
        log.warn({ event: 'driver_signal', kind: s.kind, message: clean(s.message) });
        continue;
      }
      addFinding(kind, s.message, s.url ?? at);
      newSignals.push(s);
    }
  };

  const markStep = (
    i: number,
    status: StepStatus,
    extra: { statement?: string; evidence?: string; screenshot?: string },
  ): void => {
    const r = results[i];
    if (r) Object.assign(r, { status }, extra);
  };

  /** Returns false when the run must stop. */
  const act = async (call: ToolCall, pageText: string): Promise<boolean> => {
    switch (call.name) {
      case 'stuck':
        stuckReason = clean(call.input.reason);
        return false;
      case 'done':
        history.push('done() was called but steps remain: finish them first');
        if (++invalidStreak >= MAX_INVALID_IN_A_ROW) {
          stuckReason = 'the model called done() before finishing the steps';
          return false;
        }
        return true;
      case 'expect': {
        const { statement, result, evidence } = call.input;
        const n = stepIndex + 1;
        let screenshot: string | undefined;
        try {
          screenshot = await driver.saveScreenshot(`step-${String(n)}-${result}`);
        } catch {
          /* evidence is best effort */
        }
        const extra = {
          statement: clean(statement),
          evidence: clean(evidence),
          ...(screenshot ? { screenshot } : {}),
        };
        history.push(`expect (${result}): ${clean(statement)}`);
        if (result === 'pass') {
          const snippets = call.input.visible_text ?? [];
          const missing = snippets.filter((sn) => !containsText(pageText, sn));
          if (snippets.length === 0 || missing.length > 0) {
            history.push(
              snippets.length === 0
                ? 'expect rejected: a pass needs visible_text snippets copied from the page'
                : `expect rejected: these snippets are not on the page: ${missing.map((m) => JSON.stringify(clean(m))).join(', ')}`,
            );
            if (++rejectedPassStreak >= MAX_INVALID_IN_A_ROW) {
              stuckReason =
                'the model could not back its pass with text that is really on the page';
              return false;
            }
            return true;
          }
          rejectedPassStreak = 0;
          assertions.push({
            stepIndex,
            afterActions: actions.length,
            statement: clean(statement),
            visibleText: snippets.map(clean),
          });
          markStep(stepIndex, 'passed', extra);
          stepIndex++;
          return true;
        }
        const expected = flow.steps[stepIndex]?.expect;
        if (result === 'fail' && expected !== undefined) {
          markStep(stepIndex, 'failed', extra);
          addFinding(
            'expectation-failed',
            `step ${String(n)} expected "${expected}" but ${clean(evidence)}`,
            url,
          );
          return false;
        }
        markStep(stepIndex, result === 'unclear' ? 'unclear' : 'failed', extra);
        stuckReason =
          result === 'unclear'
            ? `step ${String(n)}: could not tell whether the result is correct (${clean(evidence)})`
            : `step ${String(n)} could not be completed (${clean(evidence)})`;
        return false;
      }
      default: {
        try {
          let action: Action;
          switch (call.name) {
            case 'click':
              action = await driver.click(call.input.target);
              break;
            case 'type': {
              const real = resolvePlaceholders(call.input.text, deps.account);
              const typed = await driver.type(call.input.target, real);
              // keep the placeholder form so secrets never reach saved actions
              action = typed.kind === 'type' ? { ...typed, text: call.input.text } : typed;
              break;
            }
            case 'navigate':
              action = await driver.navigate(call.input.path);
              break;
            case 'scroll':
              action = await driver.scroll(call.input.direction);
              break;
            case 'wait':
              action = await driver.wait(toWaitCondition(call.input));
              break;
          }
          actions.push({ stepIndex, action });
          history.push(clean(describeAction(action)));
          failedActionStreak = 0;
        } catch (e) {
          history.push(clean(`${call.name} failed: ${shortError(e)}`));
          if (++failedActionStreak >= MAX_FAILED_ACTIONS_IN_A_ROW) {
            stuckReason = clean(`actions kept failing: ${shortError(e)}`);
            return false;
          }
        }
        return true;
      }
    }
  };

  try {
    while (stepIndex < flow.steps.length) {
      if (opts.signal?.aborted) {
        stuckReason = 'the run was aborted';
        break;
      }
      budget.check();

      // LOOK
      let obs = await driver.observe();
      url = obs.url;
      absorb(driver.drainSignals(), url);
      if (obs.blank) addFinding('blank-page', 'the page is blank', url);
      if (obs.busy && !busyChecked.has(url)) {
        busyChecked.add(url);
        await driver.wait({ kind: 'idle', timeoutMs: 3000 }).catch(() => undefined);
        obs = await driver.observe();
        absorb(driver.drainSignals(), url);
        if (obs.busy) addFinding('spinner', 'a loading indicator never went away', url);
      }
      const serverErrors = driver.stats().serverErrors;
      if (serverErrors >= (opts.maxServerErrors ?? 5)) {
        setupProblem = `staging returned ${String(serverErrors)} server errors, so the run stopped to be gentle`;
        break;
      }

      // THINK
      const userText = clean(
        buildUserText({
          flow,
          stepIndex,
          statuses: results.map((r) => r.status),
          history,
          newSignals,
          observation: obs,
          stepsLeft: budget.stepsLeft,
        }),
      );
      newSignals = [];
      let decision;
      try {
        decision = await ai.decide({
          system: SYSTEM_PROMPT,
          userText,
          screenshot: obs.screenshot,
          promptVersion: PROMPT_VERSION,
        });
      } catch (e) {
        log.error({ event: 'ai_error', runId: opts.runId, error: clean(shortError(e)) });
        stuckReason = `the AI request failed: ${clean(shortError(e))}`;
        break;
      }
      budget.recordStep();
      budget.addCost(decision.costUsd);
      model = decision.model;
      cost.calls++;
      cost.inputTokens += decision.usage.inputTokens;
      cost.outputTokens += decision.usage.outputTokens;
      cost.usd += decision.costUsd;
      log.info({
        event: 'ai_call',
        runId: opts.runId,
        step: budget.stepsTaken,
        stepIndex,
        model: decision.model,
        inputTokens: decision.usage.inputTokens,
        outputTokens: decision.usage.outputTokens,
        costUsd: decision.costUsd,
        promptVersion: PROMPT_VERSION,
        tool: decision.call?.name ?? null,
        reasoning: clean(decision.reasoning),
      });

      const parsed = parseToolCall(decision.call);
      if (!parsed.ok) {
        history.push(`(rejected: ${parsed.error})`);
        if (++invalidStreak >= MAX_INVALID_IN_A_ROW) {
          stuckReason = 'the model kept producing invalid tool calls';
          break;
        }
        continue;
      }
      if (parsed.call.name !== 'done') invalidStreak = 0;

      // ACT + CHECK
      if (!(await act(parsed.call, obs.visibleText))) break;
    }
    absorb(driver.drainSignals(), url);
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      stuckReason = e.message;
    } else {
      log.error({ event: 'run_error', runId: opts.runId, error: clean(shortError(e)) });
      stuckReason = `unexpected error: ${clean(shortError(e))}`;
    }
  }

  const allStepsPassed = results.every((r) => r.status === 'passed');
  const { verdict, reason } = decideVerdict({
    ...(setupProblem !== undefined ? { setupProblem } : {}),
    findings,
    ...(stuckReason !== undefined ? { stuckReason } : {}),
    allStepsPassed,
  });
  const result: RunResult = {
    runId: opts.runId,
    flow: flow.flow,
    verdict,
    reason,
    steps: budget.stepsTaken,
    durationSeconds: Math.round(budget.elapsedSeconds() * 10) / 10,
    cost,
    stepResults: results,
    findings,
    actions,
    assertions,
    finalUrl: url,
    promptVersion: PROMPT_VERSION,
    model,
  };
  log.info({
    event: 'run_finished',
    runId: opts.runId,
    verdict,
    reason,
    steps: result.steps,
    durationSeconds: result.durationSeconds,
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
    costUsd: cost.usd,
    promptVersion: PROMPT_VERSION,
  });
  return result;
}

export function describeAction(a: Action): string {
  switch (a.kind) {
    case 'navigate':
      return `navigate ${a.path}`;
    case 'click':
      return `click ${describeTarget(a.target)}`;
    case 'type':
      return `type ${JSON.stringify(a.text)} into ${describeTarget(a.target)}`;
    case 'scroll':
      return `scroll ${a.direction}`;
    case 'wait':
      return `wait ${a.condition.kind}`;
  }
}
