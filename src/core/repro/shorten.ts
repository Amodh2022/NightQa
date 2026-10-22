/**
 * Delta debugging: finds a short subsequence of `items` that still makes `reproduces` true by dropping
 * chunks. Spends at most `maxTrials` replays. The result is never longer than the input and always reproduces
 * (the input itself is assumed to).
 */
export async function shortenRecipe<T>(
  items: readonly T[],
  reproduces: (candidate: readonly T[]) => Promise<boolean>,
  maxTrials: number,
): Promise<{ items: readonly T[]; trials: number }> {
  let current = [...items];
  let parts = 2;
  let trials = 0;
  while (current.length >= 1 && trials < maxTrials) {
    const chunk = Math.ceil(current.length / parts);
    let reduced = false;
    for (let i = 0; i < current.length && trials < maxTrials; i += chunk) {
      const without = [...current.slice(0, i), ...current.slice(i + chunk)];
      trials++;
      if (await reproduces(without)) {
        current = without;
        parts = Math.max(parts - 1, 2);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (parts >= current.length) break;
      parts = Math.min(current.length, parts * 2);
    }
  }
  return { items: current, trials };
}
