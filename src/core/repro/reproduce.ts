import type { RecordedAction } from '../agent/loop.js';
import { actualFor, expectedFor, titleFor } from './describe.js';
import { rateSeverity } from './severity.js';
import { shortenRecipe } from './shorten.js';
import type { AttemptOutcome, BugCandidate, ReproStatus, Reproduction } from './types.js';

export interface ReproduceDeps {
  /** Replays this recipe once in a fresh browser (no AI). */
  readonly attempt: (actions: readonly RecordedAction[]) => Promise<AttemptOutcome>;
}

export interface ReproduceOptions {
  /** Verification replays. Default 3. */
  readonly attempts?: number;
  /** Replays spent trying to shorten the recipe. Default 12. */
  readonly maxShrinkTrials?: number;
}

/** Confirmed = every replay hit it, Not reproduced = none did, Flaky = some did. */
export function classify(results: readonly boolean[]): ReproStatus {
  const hits = results.filter(Boolean).length;
  if (results.length > 0 && hits === results.length) return 'confirmed';
  return hits === 0 ? 'not_reproduced' : 'flaky';
}

/** The actions that matter for a bug: for a failed expectation, only those before the failing check. */
export function recipeActions(c: BugCandidate): readonly RecordedAction[] {
  return c.proof ? c.actions.slice(0, c.proof.afterActions) : c.actions;
}

/**
 * Replays a suspected bug several times in fresh browsers, classifies it, and for a confirmed bug shortens
 * the recipe (the shorter recipe must itself reproduce every time, otherwise the full recipe is kept).
 */
export async function reproduce(
  c: BugCandidate,
  deps: ReproduceDeps,
  opts: ReproduceOptions = {},
): Promise<Reproduction> {
  const n = opts.attempts ?? 3;
  const original = recipeActions(c);
  const replayAll = async (actions: readonly RecordedAction[]): Promise<AttemptOutcome[]> => {
    const out: AttemptOutcome[] = [];
    for (let i = 0; i < n; i++) out.push(await deps.attempt(actions));
    return out;
  };

  let attempts = await replayAll(original);
  let status = classify(attempts.map((a) => a.reproduced));
  let recipe = original;
  // An absence-only proof ("the confirmation is not shown") also holds on a page where no action was taken yet,
  // so it cannot tell which actions matter: keep the full recipe.
  const canShorten = c.proof?.visibleText.length !== 0;
  if (status === 'confirmed' && canShorten) {
    const { items } = await shortenRecipe(
      original,
      async (cand) => (await deps.attempt(cand)).reproduced,
      opts.maxShrinkTrials ?? 12,
    );
    if (items.length < original.length) {
      const again = await replayAll(items);
      if (classify(again.map((a) => a.reproduced)) === 'confirmed') {
        recipe = items;
        attempts = again;
      }
    }
  }
  status = classify(attempts.map((a) => a.reproduced));
  return {
    id: c.id,
    status,
    reproducedCount: attempts.filter((a) => a.reproduced).length,
    attemptCount: attempts.length,
    attempts,
    recipe,
    originalActionCount: original.length,
    severity: rateSeverity(c),
    title: titleFor(c),
    expectedText: expectedFor(c),
    actualText: actualFor(c),
  };
}
