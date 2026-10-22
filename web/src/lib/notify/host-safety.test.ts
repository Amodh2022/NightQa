import { describe, expect, it } from 'vitest';
import { UnsafeTargetError, assertSafeTarget, expandIpv6, isBlockedAddress, parseTarget } from './host-safety';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2002:7f00:1::1', '2001:db8::1', '[::1]', 'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '11.0.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8', '2a00:1450:4009:81f::200e'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('expandIpv6', () => {
  it('expands compressed and mixed forms', () => {
    expect(expandIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(expandIpv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    expect(expandIpv6('1:2:3:4:5:6:7:8')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(expandIpv6('1::2::3')).toBeUndefined();
    expect(expandIpv6('1:2:3')).toBeUndefined();
  });
});

describe('parseTarget', () => {
  it('requires https and refuses credentials and odd ports', () => {
    expect(() => parseTarget('http://hooks.slack.com/services/x')).toThrow(UnsafeTargetError);
    expect(() => parseTarget('https://user:pw@example.com/x')).toThrow(UnsafeTargetError);
    expect(() => parseTarget('https://example.com:8443/x')).toThrow(UnsafeTargetError);
    expect(() => parseTarget('nonsense')).toThrow(UnsafeTargetError);
  });
  it('refuses private literals in every spelling, and local names', () => {
    for (const u of ['https://127.0.0.1/x', 'https://2130706433/x', 'https://0x7f.0.0.1/x', 'https://[::1]/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'https://svc.internal/x', 'https://printer.local/x', 'https://[::ffff:10.0.0.1]/x']) {
      expect(() => parseTarget(u), u).toThrow(UnsafeTargetError);
    }
  });
  it('applies the allow-list and path prefix', () => {
    const rules = { allowedHosts: ['hooks.slack.com'], pathPrefix: '/services/' };
    expect(parseTarget('https://hooks.slack.com/services/T/B/x', rules).hostname).toBe('hooks.slack.com');
    expect(() => parseTarget('https://hooks.slack.com.evil.com/services/T', rules)).toThrow(UnsafeTargetError);
    expect(() => parseTarget('https://hooks.slack.com/other', rules)).toThrow(UnsafeTargetError);
  });
});

describe('assertSafeTarget', () => {
  it('accepts a host that resolves to public addresses only', async () => {
    const u = await assertSafeTarget('https://example.com/hook', {}, () => Promise.resolve(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']));
    expect(u.hostname).toBe('example.com');
  });
  it('refuses a host that resolves to a private address (even one of several)', async () => {
    await expect(assertSafeTarget('https://example.com/hook', {}, () => Promise.resolve(['93.184.216.34', '10.0.0.5']))).rejects.toThrow(UnsafeTargetError);
    await expect(assertSafeTarget('https://example.com/hook', {}, () => Promise.resolve(['169.254.169.254']))).rejects.toThrow(UnsafeTargetError);
  });
  it('fails closed when the name does not resolve', async () => {
    await expect(assertSafeTarget('https://example.com/hook', {}, () => Promise.reject(new Error('ENOTFOUND')))).rejects.toThrow(UnsafeTargetError);
    await expect(assertSafeTarget('https://example.com/hook', {}, () => Promise.resolve([]))).rejects.toThrow(UnsafeTargetError);
  });
  it('allows a public IP literal without a lookup', async () => {
    const u = await assertSafeTarget('https://8.8.8.8/hook', {}, () => Promise.reject(new Error('must not resolve')));
    expect(u.hostname).toBe('8.8.8.8');
  });
});
