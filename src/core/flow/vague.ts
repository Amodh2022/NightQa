const VAGUE_PHRASES =
  /\b(looks?|seems?|appears?)\b|\b(fine|ok|okay|good|nice|correct|right|normal|properly|as expected|works?|working|no issues?|no problems?|success(ful)?)\b/i;

const CONCRETE =
  /\d|["'“”‘’$€£₹%]|\b(shows?|displays?|contains?|equals?|is disabled|is enabled|is visible|is hidden|url)\b.{6,}/i;

/** A concrete, checkable example shown next to a vague expectation. */
export const BETTER_EXPECT_EXAMPLE = 'cart shows 1 item, total $49.00';

/**
 * True when an expectation cannot be checked from the page, like "looks fine".
 * Heuristic: contains a vague word and nothing concrete (a number, a quoted value, or a specific claim).
 */
export function isVagueExpectation(expectation: string): boolean {
  const words = expectation.trim().split(/\s+/).length;
  if (!VAGUE_PHRASES.test(expectation)) return false;
  if (CONCRETE.test(expectation)) return false;
  return words <= 8;
}
