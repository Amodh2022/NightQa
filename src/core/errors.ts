/** One problem found in a flow file, with its position for friendly messages. */
export interface FlowIssue {
  readonly line: number;
  readonly column: number;
  readonly path: string;
  readonly message: string;
}

/** Thrown when a flow file is malformed. The message names the line and the problem. */
export class FlowValidationError extends Error {
  override readonly name = 'FlowValidationError';

  constructor(
    readonly source: string,
    readonly issues: readonly FlowIssue[],
  ) {
    super(
      issues.map((i) => `${source}:${String(i.line)}:${String(i.column)} ${i.message}`).join('\n'),
    );
  }
}

/** Thrown when a run exceeds its step, time or cost budget. */
export class BudgetExceededError extends Error {
  override readonly name = 'BudgetExceededError';

  constructor(
    readonly budget: 'steps' | 'seconds' | 'cost',
    readonly limit: number,
  ) {
    super(`Budget exceeded: ${budget} limit of ${String(limit)} reached`);
  }
}
