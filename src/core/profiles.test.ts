import { describe, expect, it } from 'vitest';
import { describeProfile, isDefaultProfile, profileSpecLines } from './profiles.js';

describe('profiles', () => {
  it('describes and detects the default', () => {
    expect(isDefaultProfile({ network: 'none', screen: 'desktop' })).toBe(true);
    expect(describeProfile({ network: 'none', screen: 'desktop' })).toBe('default');
    expect(describeProfile({ network: 'slow-3g', screen: 'android-small' })).toBe(
      'slow-3g on android-small',
    );
    expect(describeProfile({ network: 'none', screen: 'iphone' })).toBe('iphone');
  });
  it('writes the same conditions into a generated test', () => {
    expect(profileSpecLines({ network: 'none', screen: 'desktop' })).toEqual({
      use: [],
      setup: [],
    });
    const p = profileSpecLines({ network: 'slow-3g', screen: 'android-small' });
    expect(p.use[0]).toContain('width: 360');
    expect(p.use[0]).toContain('isMobile: true');
    expect(p.setup.join('\n')).toContain('Network.emulateNetworkConditions');
    expect(p.setup.join('\n')).toContain('latency: 2000');
  });
});
