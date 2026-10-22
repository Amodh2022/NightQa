import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_BUG_IDS, BUG_CATALOG, parseBugSelection } from '../zoo/bugs.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';

describe('parseBugSelection', () => {
  it('defaults to all bugs', () => {
    expect([...parseBugSelection(undefined)]).toEqual(ALL_BUG_IDS);
  });
  it('supports none and lists', () => {
    expect(parseBugSelection('none').size).toBe(0);
    expect([...parseBugSelection('b01, B04')]).toEqual(['B01', 'B04']);
  });
  it('rejects unknown ids', () => {
    expect(() => parseBugSelection('B99')).toThrow('Unknown zoo bug');
  });
  it('has exactly ten bugs with unique ids', () => {
    expect(BUG_CATALOG).toHaveLength(10);
    expect(new Set(ALL_BUG_IDS).size).toBe(10);
  });
});

describe('zoo with every bug', () => {
  let zoo: ZooHandle;
  beforeAll(async () => {
    zoo = await startZoo({ bugs: parseBugSelection('all') });
  });
  afterAll(async () => {
    await zoo.close();
  });

  it('B01 accepts the expired coupon', async () => {
    const r: unknown = await (await fetch(`${zoo.url}/api/coupon?code=EXPIRED50`)).json();
    expect(r).toEqual({ ok: true, percent: 50 });
  });
  it('B04 returns 500 for an ampersand search', async () => {
    expect((await fetch(`${zoo.url}/api/search?q=${encodeURIComponent('a & b')}`)).status).toBe(
      500,
    );
  });
  it('B05 returns 404 for the returns policy', async () => {
    expect((await fetch(`${zoo.url}/returns`)).status).toBe(404);
  });
  it('B06 serves a blank orders page', async () => {
    const text = await (await fetch(`${zoo.url}/orders`)).text();
    expect(text).toContain('<body></body>');
  });
  it('B07 never answers the reviews request', async () => {
    await expect(
      fetch(`${zoo.url}/api/reviews/tshirt`, { signal: AbortSignal.timeout(300) }),
    ).rejects.toThrow();
  });
  it('exposes the enabled bugs to pages', async () => {
    const text = await (await fetch(`${zoo.url}/products`)).text();
    expect(text).toContain('window.BUGS=["B01"');
  });
});

describe('zoo with no bugs (clean baseline)', () => {
  let zoo: ZooHandle;
  beforeAll(async () => {
    zoo = await startZoo({ bugs: parseBugSelection('none') });
  });
  afterAll(async () => {
    await zoo.close();
  });

  it('rejects the expired coupon', async () => {
    const r = (await (await fetch(`${zoo.url}/api/coupon?code=EXPIRED50`)).json()) as {
      ok: boolean;
    };
    expect(r.ok).toBe(false);
  });
  it('accepts a valid coupon', async () => {
    const r: unknown = await (await fetch(`${zoo.url}/api/coupon?code=save10`)).json();
    expect(r).toEqual({ ok: true, percent: 10 });
  });
  it('searches with an ampersand', async () => {
    expect((await fetch(`${zoo.url}/api/search?q=${encodeURIComponent('a & b')}`)).status).toBe(
      200,
    );
  });
  it('serves returns, orders and reviews', async () => {
    expect((await fetch(`${zoo.url}/returns`)).status).toBe(200);
    expect(await (await fetch(`${zoo.url}/orders`)).text()).toContain('Order history');
    expect((await fetch(`${zoo.url}/api/reviews/tshirt`)).status).toBe(200);
  });
  it('takes a payment and numbers the order', async () => {
    const post = (card: string) =>
      fetch(`${zoo.url}/api/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ card, total: 49 }),
      });
    const ok = (await (await post('4242424242424242')).json()) as { orderId: string };
    expect(ok.orderId).toMatch(/^ORD-\d+$/);
    const declined = (await (await post('4000000000000002')).json()) as { ok: boolean };
    expect(declined.ok).toBe(false);
  });
  it('signs in the test buyer', async () => {
    const r = await fetch(`${zoo.url}/api/login`, {
      method: 'POST',
      body: JSON.stringify({ email: 'test-buyer@example.com', password: 'zoo-pass' }),
    });
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true);
  });
  it('404s unknown pages', async () => {
    expect((await fetch(`${zoo.url}/nope`)).status).toBe(404);
  });
});
