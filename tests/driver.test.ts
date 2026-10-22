import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseBugSelection } from '../zoo/bugs.js';
import { startZoo, type ZooHandle } from '../zoo/server.js';
import { ElementNotFoundError, NavigationBlockedError } from '../src/core/errors.js';
import { UrlPolicyError } from '../src/core/url-policy.js';
import { PlaywrightDriver } from '../src/io/playwright-driver.js';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

describe('PlaywrightDriver against the zoo', () => {
  let zoo: ZooHandle;
  beforeAll(async () => {
    zoo = await startZoo({ bugs: parseBugSelection('all') });
  });
  afterAll(async () => {
    await zoo.close();
  });

  async function open(path = '/products', extra: { blockedPaths?: string[] } = {}) {
    const driver = new PlaywrightDriver({
      baseUrl: zoo.url + path,
      evidenceDir: await mkdtemp(join(tmpdir(), 'nightqa-')),
      urlPolicy: { allowPrivateNetwork: true },
      minRequestIntervalMs: 0,
      ...extra,
    });
    await driver.start();
    return driver;
  }

  it('refuses production-looking and metadata URLs at construction', () => {
    expect(
      () => new PlaywrightDriver({ baseUrl: 'https://shopkart.in', evidenceDir: 'x' }),
    ).toThrow(UrlPolicyError);
    expect(
      () =>
        new PlaywrightDriver({
          baseUrl: 'http://169.254.169.254',
          evidenceDir: 'x',
          urlPolicy: { allowPrivateNetwork: true, allowProduction: true },
        }),
    ).toThrow(UrlPolicyError);
  });

  it('observes elements, clicks by ref and records replayable actions', async () => {
    const d = await open();
    try {
      const obs = await d.observe();
      expect(Array.from(obs.screenshot.slice(0, 4))).toEqual(PNG_MAGIC);
      expect(obs.visibleText).toContain('Products');
      const link = obs.elements.find((e) => e.role === 'link' && e.name === 'Blue T-shirt');
      expect(link).toBeDefined();
      const action = await d.click(link?.ref ?? '');
      expect(action).toEqual({
        kind: 'click',
        target: { by: 'role', role: 'link', name: 'Blue T-shirt', nth: 0 },
      });
      const product = await d.observe();
      expect(product.url).toContain('/product/tshirt');
      expect(product.elements.some((e) => e.role === 'combobox' && e.name === 'Size')).toBe(true);
      // replay without any ref
      await d.perform({ kind: 'navigate', path: '/products' });
      await d.perform(action);
      expect((await d.observe()).url).toContain('/product/tshirt');
    } finally {
      await d.stop();
    }
  });

  it('types into fields and reads back values, hiding passwords', async () => {
    const d = await open('/login');
    try {
      const obs = await d.observe();
      const email = obs.elements.find((e) => e.name === 'Email');
      const pw = obs.elements.find((e) => e.name === 'Password');
      expect(pw?.role).toBe('textbox (password)');
      await d.type(email?.ref ?? '', 'a@b.co');
      await d.type(pw?.ref ?? '', 'super-secret');
      const after = await d.observe();
      expect(after.elements.find((e) => e.name === 'Email')?.value).toBe('a@b.co');
      expect(JSON.stringify(after.elements)).not.toContain('super-secret');
    } finally {
      await d.stop();
    }
  });

  it('reports an uncaught JS error (B03)', async () => {
    const d = await open('/product/tshirt');
    try {
      const obs = await d.observe();
      await d.click(obs.elements.find((e) => e.name === 'Add to wishlist')?.ref ?? '');
      const kinds = d.drainSignals().map((s) => s.kind);
      expect(kinds).toContain('page-error');
    } finally {
      await d.stop();
    }
  });

  it('reports a 5xx response (B04) and counts it', async () => {
    const d = await open();
    try {
      await d.perform({ kind: 'navigate', path: '/search?q=a%26b' });
      await d.perform({ kind: 'wait', condition: { kind: 'text', text: 'Something went wrong' } });
      expect(d.drainSignals().some((s) => s.kind === 'http-5xx' && s.status === 500)).toBe(true);
      expect(d.stats().serverErrors).toBe(1);
    } finally {
      await d.stop();
    }
  });

  it('reports a dead in-app link (B05)', async () => {
    const d = await open();
    try {
      const obs = await d.observe();
      await d.click(obs.elements.find((e) => e.name === 'Returns policy')?.ref ?? '');
      expect(d.drainSignals().some((s) => s.kind === 'page-not-found')).toBe(true);
    } finally {
      await d.stop();
    }
  });

  it('flags a blank page (B06) and a busy page (B07)', async () => {
    const d = await open('/orders');
    try {
      expect((await d.observe()).blank).toBe(true);
      await d.perform({ kind: 'navigate', path: '/product/tshirt' });
      const obs = await d.observe();
      expect(obs.blank).toBe(false);
      expect(obs.busy).toBe(true);
    } finally {
      await d.stop();
    }
  });

  it('blocks off-origin navigation, blocked paths and unknown refs', async () => {
    const d = await open('/products', { blockedPaths: ['/orders'] });
    try {
      await expect(d.navigate('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(
        NavigationBlockedError,
      );
      await expect(d.navigate('/orders')).rejects.toBeInstanceOf(NavigationBlockedError);
      await expect(d.click('e999')).rejects.toBeInstanceOf(ElementNotFoundError);
    } finally {
      await d.stop();
    }
  });

  it('saves video, trace and screenshots as evidence', async () => {
    const d = await open();
    await d.saveScreenshot('products page');
    const artifacts = await d.stop();
    expect(artifacts.screenshots).toHaveLength(1);
    expect(existsSync(artifacts.screenshots[0] ?? '')).toBe(true);
    expect(existsSync(artifacts.tracePath ?? '')).toBe(true);
    expect(existsSync(artifacts.videoPath ?? '')).toBe(true);
  });
});
