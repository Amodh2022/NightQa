import { describe, expect, it } from 'vitest';
import {
  UrlPolicyError,
  checkTestUrl,
  isMetadataAddress,
  isPrivateAddress,
  isRequestAllowed,
  type UrlPolicyReason,
} from './url-policy.js';

function reasonOf(url: string, opts = {}): UrlPolicyReason | undefined {
  try {
    checkTestUrl(url, opts);
  } catch (e) {
    if (e instanceof UrlPolicyError) return e.reason;
    throw e;
  }
  return undefined;
}

describe('checkTestUrl', () => {
  it.each([
    'https://staging.shopkart.in',
    'https://shop-stg.example.com/app',
    'https://qa.example.io',
  ])('accepts staging-looking %s', (u) => {
    expect(reasonOf(u)).toBeUndefined();
  });

  it.each(['https://shopkart.in', 'https://www.example.com'])(
    'refuses production-looking %s',
    (u) => {
      expect(reasonOf(u)).toBe('production-looking');
    },
  );

  it('allows production only when asked', () => {
    expect(reasonOf('https://shopkart.in', { allowProduction: true })).toBeUndefined();
  });

  it.each([
    'http://127.0.0.1:4010',
    'http://localhost:3000',
    'http://10.1.2.3',
    'http://192.168.1.5',
    'http://172.20.0.1',
    'http://[::1]/',
    'http://2130706433/', // decimal form of 127.0.0.1
    'http://0x7f.0.0.1/',
    'http://app.internal',
  ])('blocks private target %s by default', (u) => {
    expect(reasonOf(u)).toBe('private-network');
  });

  it('allows private targets when explicitly allowed', () => {
    expect(reasonOf('http://127.0.0.1:4010', { allowPrivateNetwork: true })).toBeUndefined();
  });

  it.each([
    'http://169.254.169.254/latest/meta-data',
    'http://metadata.google.internal/',
    'http://[::ffff:169.254.169.254]/',
    'http://[fd00:ec2::254]/',
  ])('always blocks cloud metadata %s', (u) => {
    expect(reasonOf(u, { allowPrivateNetwork: true, allowProduction: true })).toBe(
      'cloud-metadata',
    );
  });

  it('rejects bad protocols, bad URLs and embedded credentials', () => {
    expect(reasonOf('file:///etc/passwd')).toBe('bad-protocol');
    expect(reasonOf('not a url')).toBe('invalid-url');
    expect(reasonOf('https://user:pw@staging.example.com')).toBe('credentials-in-url');
  });
});

describe('address helpers', () => {
  it('classifies private and metadata addresses', () => {
    expect(isPrivateAddress('172.31.255.1')).toBe(true);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isMetadataAddress('169.254.1.1')).toBe(true);
    expect(isMetadataAddress('10.0.0.1')).toBe(false);
  });
});

describe('isRequestAllowed', () => {
  const allowed = new Set(['https://staging.example.com']);
  it('allows only listed origins, data URLs and about:blank', () => {
    expect(isRequestAllowed('https://staging.example.com/api', allowed)).toBe(true);
    expect(isRequestAllowed('https://evil.example.com/', allowed)).toBe(false);
    expect(isRequestAllowed('http://169.254.169.254/', allowed)).toBe(false);
    expect(isRequestAllowed('data:text/plain,hi', allowed)).toBe(true);
    expect(isRequestAllowed('about:blank', allowed)).toBe(true);
    expect(isRequestAllowed('::bad::', allowed)).toBe(false);
  });
});
