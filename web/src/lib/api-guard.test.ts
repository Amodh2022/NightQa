import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readBody, requireMember, sameOrigin } from './api-guard';

const req = (headers: Record<string, string> = {}, body?: unknown) =>
  new Request('http://nq.test/api/settings/x', { method: 'POST', headers: { host: 'nq.test', ...headers }, body: body === undefined ? null : JSON.stringify(body) });

describe('sameOrigin', () => {
  it('allows no Origin and a matching one, refuses others', () => {
    expect(sameOrigin(req())).toBe(true);
    expect(sameOrigin(req({ origin: 'http://nq.test' }))).toBe(true);
    expect(sameOrigin(req({ origin: 'http://evil.test' }))).toBe(false);
    expect(sameOrigin(req({ origin: 'nonsense' }))).toBe(false);
  });
});

describe('requireMember', () => {
  it('maps cross-origin, anonymous, viewer and member', async () => {
    const m = { login: 'a', role: 'member', signedIn: true } as const;
    const v = { login: 'b', role: 'viewer', signedIn: true } as const;
    const cross = await requireMember(req({ origin: 'http://evil.test' }), () => Promise.resolve(m));
    expect('response' in cross && cross.response.status).toBe(403);
    const anon = await requireMember(req(), () => Promise.resolve(undefined));
    expect('response' in anon && anon.response.status).toBe(401);
    const view = await requireMember(req(), () => Promise.resolve(v));
    expect('response' in view && view.response.status).toBe(403);
    expect(await requireMember(req(), () => Promise.resolve(m))).toEqual({ viewer: m });
  });
});

describe('readBody', () => {
  it('does not echo submitted values in errors', async () => {
    const r = await readBody(req({}, { value: 12345 }), z.object({ value: z.string() }));
    expect('response' in r).toBe(true);
    if ('response' in r) {
      expect(r.response.status).toBe(400);
      expect(JSON.stringify(await r.response.json())).not.toContain('12345');
    }
  });
});
