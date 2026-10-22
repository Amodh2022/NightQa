import type { Recording } from './recording.js';
import type { Action, TargetSpec } from './ports.js';

const q = (s: string): string => JSON.stringify(s);

/** Env var holding a saved account value, e.g. test-buyer -> NIGHTQA_ACCOUNT_TEST_BUYER_PASSWORD. */
export function accountEnvVar(login: string, which: 'USERNAME' | 'PASSWORD'): string {
  return `NIGHTQA_ACCOUNT_${login.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${which}`;
}

function locator(t: TargetSpec): string {
  const base =
    t.by === 'label'
      ? `page.getByLabel(${q(t.name)}, { exact: true })`
      : `page.getByRole(${q(t.role)}, { name: ${q(t.name)}, exact: true })`;
  return t.nth > 0 ? `${base}.nth(${String(t.nth)})` : base;
}

/** Turns "{{account.password}}" placeholders into process.env lookups so no secret is ever written to a test. */
function textExpr(text: string, login: string | undefined): string {
  if (!/\{\{account\.(username|password)\}\}/.test(text)) return q(text);
  const body = text
    .replace(/[`\\$]/g, (c) => `\\${c}`)
    .replace(
      /\{\{account\.(username|password)\}\}/g,
      (_, w: 'username' | 'password') =>
        `\${process.env.${accountEnvVar(login ?? 'account', w === 'username' ? 'USERNAME' : 'PASSWORD')} ?? ''}`,
    );
  return `\`${body}\``;
}

/** Playwright lines for one recorded action. Fixed-time waits and scrolls are never written. */
export function actionLines(a: Action, login: string | undefined): string[] {
  const lines: string[] = [];
  switch (a.kind) {
    case 'navigate':
      lines.push(`  await page.goto(${q(a.path)});`);
      break;
    case 'click':
      lines.push(`  await ${locator(a.target)}.click();`);
      break;
    case 'type':
      lines.push(
        a.target.by === 'role' && a.target.role === 'combobox'
          ? `  await ${locator(a.target)}.selectOption({ label: ${textExpr(a.text, login)} });`
          : `  await ${locator(a.target)}.fill(${textExpr(a.text, login)});`,
      );
      break;
    case 'wait':
      if (a.condition.kind === 'text') {
        lines.push(`  await expect(page.getByText(${q(a.condition.text)}).first()).toBeVisible();`);
      } else if (a.condition.kind === 'idle') {
        lines.push(`  await page.waitForLoadState('networkidle');`);
      }
      break; // fixed-time waits are never written: assertions auto-wait
    case 'scroll':
      break; // Playwright scrolls into view before every action
  }
  return lines;
}

/**
 * Generates a plain Playwright test (.spec.ts) from a recording. It uses stable locators (roles and labels),
 * web-first assertions with auto-waiting, no sleeps, and reads credentials from the environment.
 * The customer owns the file and can run it with `npx playwright test` without NightQA.
 */
export function generateSpec(rec: Recording): string {
  const lines: string[] = [
    `// NightQA: "${rec.flow.replace(/[\r\n]+/g, ' ')}" (run ${rec.runId})`,
    `// Plain Playwright test. Edit it freely and run it with: NIGHTQA_BASE_URL=<staging> npx playwright test`,
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test.use({ baseURL: process.env.NIGHTQA_BASE_URL });`,
    ``,
    `test(${q(rec.flow)}, async ({ page }) => {`,
    `  await page.goto(${q(rec.start)});`,
  ];
  let step = -1;
  for (const e of rec.events) {
    if (e.stepIndex !== step) {
      step = e.stepIndex;
      lines.push(
        ``,
        `  // Step ${String(step + 1)}: ${(rec.steps[step] ?? '').replace(/[\r\n]+/g, ' ')}`,
      );
    }
    if (e.type === 'assert') {
      for (const s of e.visibleText)
        lines.push(`  await expect(page.getByText(${q(s)}).first()).toBeVisible();`);
      continue;
    }
    lines.push(...actionLines(e.action, rec.login));
  }
  lines.push(`});`, ``);
  return lines.join('\n');
}
