import type { RecordedAction } from '../agent/loop.js';
import { pathOf } from '../repro/fingerprint.js';
import type { BugCandidate, Reproduction } from '../repro/types.js';
import { profileSpecLines, DEFAULT_PROFILE } from '../profiles.js';
import { actionLines } from '../specgen.js';

const q = (s: string): string => JSON.stringify(s);
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ');

/** Text that appears in the failure message of the bug check, and only there. Used to tell WHY a test failed. */
export function bugMarker(id: string): string {
  return `NIGHTQA-BUG ${id}`;
}

function setupLines(c: BugCandidate): string[] {
  const path = q(pathOf(c.finding.url));
  switch (c.finding.kind) {
    case 'js-error':
      return [
        `  const jsErrors: string[] = [];`,
        `  page.on('pageerror', (e) => jsErrors.push(\`\${e.name}: \${e.message}\`));`,
      ];
    case 'http-5xx':
      return [
        `  const serverErrors: string[] = [];`,
        `  page.on('response', (r) => {`,
        `    if (r.status() >= 500 && new URL(r.url()).pathname === ${path}) serverErrors.push(\`\${r.status()} \${r.url()}\`);`,
        `  });`,
      ];
    case 'dead-link':
      return [
        `  const notFound: string[] = [];`,
        `  page.on('response', (r) => {`,
        `    if (r.status() === 404 && r.request().isNavigationRequest() && new URL(r.url()).pathname === ${path}) notFound.push(r.url());`,
        `  });`,
      ];
    case 'console-error':
      return [
        `  const consoleErrors: string[] = [];`,
        `  page.on('console', (m) => {`,
        `    if (m.type() === 'error' && !/failed to load resource/i.test(m.text())) consoleErrors.push(m.text());`,
        `  });`,
      ];
    default:
      return [];
  }
}

function checkLines(c: BugCandidate, msg: string): string[] {
  const m = q(msg);
  switch (c.finding.kind) {
    case 'expectation-failed':
      return [
        // Wait for the page the failure was judged on, so a check never passes just because it ran too early.
        `  await page.waitForURL((u) => u.pathname === ${q(pathOf(c.finding.url))});`,
        `  await page.waitForLoadState('networkidle');`,
        ...(c.proof?.disabledControls ?? []).map(
          (d) =>
            `  await expect(page.getByRole(${q(d.role)}, { name: ${q(d.name)}, exact: true }), ${m}).toBeEnabled();`,
        ),
        ...(c.proof?.missingText ?? []).map(
          (t) => `  await expect(page.getByText(${q(t)}).first(), ${m}).toBeVisible();`,
        ),
        ...(c.proof?.visibleText ?? []).map(
          (t) => `  await expect(page.getByText(${q(t)}).first(), ${m}).toBeHidden();`,
        ),
      ];
    case 'js-error':
      return [
        `  await page.waitForLoadState('networkidle');`,
        `  expect(jsErrors, ${m}).toEqual([]);`,
      ];
    case 'http-5xx':
      return [
        `  await page.waitForLoadState('networkidle');`,
        `  expect(serverErrors, ${m}).toEqual([]);`,
      ];
    case 'dead-link':
      return [
        `  await page.waitForLoadState('networkidle');`,
        `  expect(notFound, ${m}).toEqual([]);`,
      ];
    case 'console-error':
      return [
        `  await page.waitForLoadState('networkidle');`,
        `  expect(consoleErrors, ${m}).toEqual([]);`,
      ];
    case 'blank-page':
      return [`  await expect(page.locator('body'), ${m}).toHaveText(/\\S/);`];
    case 'spinner':
      return [
        `  await expect(page.locator('[aria-busy="true"]'), ${m}).toHaveCount(0);`,
        `  await expect(page.locator('body'), ${m}).not.toContainText(/\\b(loading|please wait)\\b/i);`,
      ];
  }
}

/**
 * Writes the failing test for a confirmed bug: a plain Playwright test that replays the shortest recipe and then
 * asserts the CORRECT behaviour, so it fails while the bug exists and passes once it is fixed. Credentials are
 * read from the environment, never written into the file.
 */
export function generateBugSpec(c: BugCandidate, r: Reproduction): string {
  const profile = profileSpecLines(c.profile ?? DEFAULT_PROFILE);
  const msg = `${bugMarker(c.id)}: ${oneLine(r.title)}`;
  const lines: string[] = [
    `// NightQA failing test for ${c.id}: ${oneLine(r.title)}`,
    `// Severity: ${r.severity}. Found in flow "${oneLine(c.flow)}" (run ${c.runId}); reproduced ${String(r.reproducedCount)}/${String(r.attemptCount)} times.`,
    `// This test FAILS while the bug exists and passes once it is fixed.`,
    `// Run it with: NIGHTQA_BASE_URL=<staging> npx playwright test`,
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test.use({ baseURL: process.env.NIGHTQA_BASE_URL });`,
    ...profile.use,
    ``,
    `test(${q(r.title)}, async ({ page }) => {`,
    ...profile.setup,
    ...setupLines(c),
    `  await page.goto(${q(c.start)});`,
  ];
  r.recipe.forEach((rec: RecordedAction, i) => {
    lines.push(
      `  // ${String(i + 1)}. ${oneLine(actionComment(rec))}`,
      ...actionLines(rec.action, c.login),
    );
  });
  lines.push(
    ``,
    `  // The correct behaviour (this is what fails today):`,
    ...checkLines(c, msg),
    `});`,
    ``,
  );
  return lines.join('\n');
}

function actionComment(rec: RecordedAction): string {
  const a = rec.action;
  switch (a.kind) {
    case 'navigate':
      return `open ${a.path}`;
    case 'click':
      return `click ${a.target.name}`;
    case 'type':
      return `type into ${a.target.name}`;
    case 'scroll':
      return `scroll ${a.direction}`;
    case 'wait':
      return `wait ${a.condition.kind}`;
  }
}
