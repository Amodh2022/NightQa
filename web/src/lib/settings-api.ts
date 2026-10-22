import { z } from 'zod';
import { ACCOUNT_NAME_RE } from './accounts';
import { REPO_RE } from './github-check';
import { settingsSchema } from './settings';

/** Request bodies for /api/settings/*. Kept pure so the validation can be tested without a server. */

export const appBody = z.object({
  name: settingsSchema.shape.app.shape.name,
  targetUrl: settingsSchema.shape.app.shape.targetUrl,
  /** Required to save a URL that looks like production. The engine still refuses it unless the operator overrides. */
  confirmProduction: z.boolean().optional(),
});

export const accountBody = z.object({
  name: z.string().trim().regex(ACCOUNT_NAME_RE, 'Use letters, digits, - and _ (up to 40), starting with a letter or digit.'),
  username: z.string().min(1, 'Enter the login').max(200),
  password: z.string().min(1, 'Enter the password').max(500),
});
export const accountDeleteBody = z.object({ name: z.string().trim().regex(ACCOUNT_NAME_RE) });

export const scheduleBody = z.object({
  schedule: settingsSchema.shape.schedule,
  budgets: settingsSchema.shape.budgets,
  maxFixPerNight: settingsSchema.shape.github.shape.maxFixPerNight,
  explorationMaxSteps: settingsSchema.shape.exploration.shape.maxSteps,
});

export const githubBody = z.object({
  repo: z.string().trim().regex(REPO_RE, 'Use owner/name, for example shopkart/web.'),
  /** Omit to keep the saved token. */
  token: z.string().trim().min(10, 'That token looks too short.').max(500).optional(),
});

export const NOTIFY_SECRETS = ['notify:slack-webhook', 'notify:smtp-url', 'notify:smtp-from', 'notify:webhook-url'] as const;
export type NotifySecret = (typeof NOTIFY_SECRETS)[number];

const httpUrl = (v: string): boolean => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};

/** Validates a notification secret before it is stored. Returns an error sentence, or undefined when fine. */
export function notifyValueError(name: NotifySecret, value: string): string | undefined {
  if (name === 'notify:slack-webhook') return value.startsWith('https://') && httpUrl(value) ? undefined : 'A Slack webhook is an https:// URL.';
  if (name === 'notify:webhook-url') return httpUrl(value) ? undefined : 'A webhook is an http:// or https:// URL.';
  if (name === 'notify:smtp-url') return /^smtps?:\/\/\S+$/.test(value) ? undefined : 'An SMTP URL looks like smtps://user:password@host:465.';
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) || /^[^<>]*<[^\s@<>]+@[^\s@<>]+>$/.test(value) ? undefined : 'Use an email address, for example reports@shopkart.example.';
}

export const notifySetBody = z.object({ name: z.enum(NOTIFY_SECRETS), value: z.string().trim().min(1, 'Enter a value').max(1000) });
export const notifyDeleteBody = z.object({ name: z.enum(NOTIFY_SECRETS) });
export const recipientsBody = z.object({ to: settingsSchema.shape.notifications.shape.email.shape.to });

export const retentionBody = z.object({ days: z.number().int().min(1).max(3650) });
export const evidenceDeleteBody = z.object({ confirm: z.literal('DELETE', { error: () => 'Type DELETE to confirm.' }) });
