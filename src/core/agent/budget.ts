import type { Budgets } from '../env.js';
import { BudgetExceededError } from '../errors.js';
import type { Clock } from '../ports.js';

/** Tracks steps, elapsed time and AI cost for one run. Any limit reached ends the run as agent_stuck. */
export class BudgetTracker {
  private steps = 0;
  private costUsd = 0;
  private readonly startedAt: number;

  constructor(
    private readonly limits: Budgets,
    private readonly clock: Clock,
  ) {
    this.startedAt = clock.now();
  }

  /** Throws BudgetExceededError when a limit has already been reached. Call before each step. */
  check(): void {
    if (this.steps >= this.limits.maxSteps)
      throw new BudgetExceededError('steps', this.limits.maxSteps);
    if (this.elapsedSeconds() >= this.limits.maxSeconds)
      throw new BudgetExceededError('seconds', this.limits.maxSeconds);
    if (this.costUsd >= this.limits.maxCostUsd)
      throw new BudgetExceededError('cost', this.limits.maxCostUsd);
  }

  recordStep(): void {
    this.steps++;
  }

  addCost(usd: number): void {
    this.costUsd += usd;
  }

  elapsedSeconds(): number {
    return (this.clock.now() - this.startedAt) / 1000;
  }

  get stepsTaken(): number {
    return this.steps;
  }

  get stepsLeft(): number {
    return Math.max(0, this.limits.maxSteps - this.steps);
  }

  get spentUsd(): number {
    return this.costUsd;
  }
}
