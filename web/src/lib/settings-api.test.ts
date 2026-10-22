import { describe, expect, it } from 'vitest';
import { accountBody, evidenceDeleteBody, githubBody, notifyValueError, scheduleBody } from './settings-api';
import { DEFAULT_SETTINGS } from './settings';

describe('settings request bodies', () => {
  it('rejects bad account names (colons would break vault names)', () => {
    expect(accountBody.safeParse({ name: 'a:b', username: 'u', password: 'p' }).success).toBe(false);
    expect(accountBody.safeParse({ name: 'test-buyer', username: 'u', password: 'p' }).success).toBe(true);
  });
  it('requires owner/name for the repo', () => {
    expect(githubBody.safeParse({ repo: 'nope' }).success).toBe(false);
    expect(githubBody.safeParse({ repo: 'a/b' }).success).toBe(true);
  });
  it('validates schedule and budgets with the settings schema ranges', () => {
    const good = { schedule: DEFAULT_SETTINGS.schedule, budgets: DEFAULT_SETTINGS.budgets, maxFixPerNight: 3, explorationMaxSteps: 30 };
    expect(scheduleBody.safeParse(good).success).toBe(true);
    expect(scheduleBody.safeParse({ ...good, budgets: { ...good.budgets, maxSteps: 1 } }).success).toBe(false);
    expect(scheduleBody.safeParse({ ...good, schedule: { ...good.schedule, nightlyTime: '25:00' } }).success).toBe(false);
  });
  it('needs the typed confirmation to delete evidence', () => {
    expect(evidenceDeleteBody.safeParse({ confirm: 'delete' }).success).toBe(false);
    expect(evidenceDeleteBody.safeParse({ confirm: 'DELETE' }).success).toBe(true);
  });
  it('checks notification values', () => {
    expect(notifyValueError('notify:slack-webhook', 'http://x')).toBeDefined();
    expect(notifyValueError('notify:slack-webhook', 'https://hooks.slack.com/services/x')).toBeUndefined();
    expect(notifyValueError('notify:smtp-url', 'smtps://u:p@mail.example.com:465')).toBeUndefined();
    expect(notifyValueError('notify:smtp-from', 'not an email')).toBeDefined();
    expect(notifyValueError('notify:smtp-from', 'NightQA <qa@x.example>')).toBeUndefined();
    expect(notifyValueError('notify:webhook-url', 'javascript:alert(1)')).toBeDefined();
  });
});
