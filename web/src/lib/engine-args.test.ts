import { describe, expect, it } from 'vitest';
import { engineEnv, profileFor, settingsFlags } from './engine-args';
import { DEFAULT_SETTINGS, type Settings } from './settings';

const s = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over });
const vault = (m: Record<string, string>) => (n: string) => Promise.resolve(m[n]);

describe('settingsFlags', () => {
  it('passes blocked pages and actions and the profile, from settings only', () => {
    const f = settingsFlags(s({ profiles: { network: 'slow-3g', screen: 'iphone', perFlow: {} } }), 'flows/a.yaml');
    expect(f).toContain('--block-path');
    expect(f).toContain('/admin');
    expect(f.slice(f.indexOf('--network'), f.indexOf('--network') + 2)).toEqual(['--network', 'slow-3g']);
    expect(f).toContain('iphone');
  });
  it('omits default profile flags, and a per-flow profile wins', () => {
    expect(settingsFlags(s(), 'flows/a.yaml')).not.toContain('--network');
    const custom = s({ profiles: { network: 'none', screen: 'desktop', perFlow: { 'flows/a.yaml': { network: 'fast-3g', screen: 'android' } } } });
    expect(profileFor(custom, 'flows/a.yaml')).toEqual({ network: 'fast-3g', screen: 'android' });
    expect(profileFor(custom, 'flows/b.yaml').network).toBe('none');
  });
});

describe('engineEnv', () => {
  it('maps budgets, reporting and the login account from the vault', async () => {
    const env = await engineEnv(
      s({ autonomy: { ...DEFAULT_SETTINGS.autonomy, level: 'L2' }, github: { repo: 'acme/shop', minSeverity: 'high', maxFixPerNight: 2 } }),
      vault({ 'github:token': 'tok', 'account:test-buyer:username': 'u@x', 'account:test-buyer:password': 'pw' }),
      'test-buyer',
    );
    expect(env).toMatchObject({
      NIGHTQA_MAX_STEPS: '40',
      NIGHTQA_FIX_PRS: 'auto',
      NIGHTQA_GITHUB_REPO: 'acme/shop',
      GITHUB_TOKEN: 'tok',
      NIGHTQA_MIN_SEVERITY: 'high',
      NIGHTQA_MAX_FIX_PRS: '2',
      NIGHTQA_ACCOUNT_TEST_BUYER_USERNAME: 'u@x',
      NIGHTQA_ACCOUNT_TEST_BUYER_PASSWORD: 'pw',
    });
  });
  it('at L0 keeps bugs local: no repository or token reaches the engine', async () => {
    const env = await engineEnv(s({ autonomy: { ...DEFAULT_SETTINGS.autonomy, level: 'L0' }, github: { repo: 'acme/shop', minSeverity: 'medium', maxFixPerNight: 3 } }), vault({ 'github:token': 'tok' }), undefined);
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.NIGHTQA_GITHUB_REPO).toBeUndefined();
    expect(env.NIGHTQA_FIX_PRS).toBe('off');
  });
  it('at L1 files issues but never asks for a fix', async () => {
    const env = await engineEnv(s({ github: { repo: 'acme/shop', minSeverity: 'medium', maxFixPerNight: 3 } }), vault({ 'github:token': 'tok' }), undefined);
    expect(env.NIGHTQA_GITHUB_REPO).toBe('acme/shop');
    expect(env.NIGHTQA_FIX_PRS).toBe('manual');
  });
});
