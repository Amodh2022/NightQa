import { z } from 'zod';

/**
 * The flow-file rules, ported from the engine (src/core/flow/schema.ts and vague.ts) because the dashboard cannot
 * import the engine. Messages are identical on purpose. On save the real engine loader runs as the final check.
 */
export const FORBIDDEN_KEYS = /pass(word|wd)?|secret|token|otp|api[_-]?key|card[_-]?number|cvv/i;

function text(what: string) {
  return z
    .string({ error: (iss) => (iss.input === undefined ? 'is required' : `${what} must be text`) })
    .trim()
    .min(1, `${what} must not be empty`);
}

const stepObject = z.strictObject(
  { step: text('step'), expect: text('expect').optional() },
  {
    error: (iss) =>
      iss.code === 'unrecognized_keys'
        ? `unknown key ${iss.keys.map((k) => `"${k}"`).join(', ')} in a step (allowed: step, expect)`
        : 'a step must be text, or have "step:" and an optional "expect:"',
  },
);

const step = z.union([text('step'), stepObject], {
  error: 'each step must be plain text, or an item with "step:" and an optional "expect:"',
});

export const flowFileSchema = z
  .strictObject(
    {
      flow: text('flow'),
      start: text('start').refine((s) => s.startsWith('/') || /^https?:\/\//.test(s), {
        error: 'start must be a path like /products or a full http(s) URL',
      }),
      login: text('login')
        .regex(/^[A-Za-z0-9][\w-]*$/, {
          error: 'login must be the name of a saved test account (letters, digits, - and _), never a password',
        })
        .optional(),
      tags: z.array(text('tag'), { error: 'tags must be a list of words' }).optional(),
      steps: z
        .array(step, { error: (iss) => (iss.input === undefined ? 'is required' : 'steps must be a list') })
        .min(1, 'a flow needs at least one step'),
      variations: z.array(text('variation'), { error: 'variations must be a list' }).optional(),
    },
    {
      error: (iss) =>
        iss.code === 'unrecognized_keys'
          ? iss.keys
              .map((k) =>
                FORBIDDEN_KEYS.test(k)
                  ? `"${k}" is not allowed: flow files never contain secrets, use "login:" with a saved test account name`
                  : `unknown key "${k}" (allowed: flow, start, login, tags, steps, variations)`,
              )
              .join('; ')
          : 'a flow file must be a mapping with flow, start and steps',
    },
  )
  .check((ctx) => {
    const hasExpect = ctx.value.steps.some((s) => typeof s !== 'string' && s.expect !== undefined);
    if (!hasExpect) {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value.steps,
        path: ['steps'],
        message: 'a flow needs at least one "expect:" on a step, e.g. "expect: cart shows 1 item, total $49.00"',
      });
    }
  });

const VAGUE_PHRASES =
  /\b(looks?|seems?|appears?)\b|\b(fine|ok|okay|good|nice|correct|right|normal|properly|as expected|works?|working|no issues?|no problems?|success(ful)?)\b/i;
const CONCRETE = /\d|["'“”‘’$€£₹%]|\b(shows?|displays?|contains?|equals?|is disabled|is enabled|is visible|is hidden|url)\b.{6,}/i;

export const BETTER_EXPECT_EXAMPLE = 'cart shows 1 item, total $49.00';

/** True when an expectation cannot be checked from the page, like "looks fine". */
export function isVagueExpectation(expectation: string): boolean {
  const words = expectation.trim().split(/\s+/).length;
  if (!VAGUE_PHRASES.test(expectation)) return false;
  if (CONCRETE.test(expectation)) return false;
  return words <= 8;
}
