import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
  type Route,
} from 'playwright';
import { ElementNotFoundError, NavigationBlockedError } from '../core/errors.js';
import type {
  Action,
  BrowserDriver,
  DriverArtifacts,
  DriverSignal,
  DriverStats,
  ElementInfo,
  Observation,
  ScrollDirection,
  TargetSpec,
  WaitCondition,
} from '../core/ports.js';
import { checkTestUrl, isRequestAllowed, type UrlPolicyOptions } from '../core/url-policy.js';

export interface PlaywrightDriverOptions {
  /** Where the flow starts. Its origin is the only origin the browser may talk to (plus extras). */
  readonly baseUrl: string;
  /** Folder for video, trace and screenshots. */
  readonly evidenceDir: string;
  readonly headless?: boolean;
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly urlPolicy?: UrlPolicyOptions;
  readonly extraAllowedOrigins?: readonly string[];
  /** Path prefixes that must never be visited, such as /account/delete. */
  readonly blockedPaths?: readonly string[];
  /** Minimum gap between requests to staging, to stay gentle. */
  readonly minRequestIntervalMs?: number;
  readonly actionTimeoutMs?: number;
  readonly navigationTimeoutMs?: number;
  /** Use an installed browser instead of Playwright's download. */
  readonly executablePath?: string;
  /** Record video and a trace. Default true. */
  readonly record?: boolean;
}

interface RawElement {
  role: string;
  name: string;
  text: string;
  enabled: boolean;
  checked: boolean | null;
  value: string | null;
  isPassword: boolean;
}

const MAX_TEXT = 4000;
const MAX_ELEMENTS = 80;

/** Runs inside the page. Must be self-contained: no outside references. */
function collectElements(): RawElement[] {
  const selector =
    'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=checkbox],[role=switch],[role=tab],[role=menuitem],[role=textbox]';
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const roleOf = (el: Element): string => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const t = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
      if (t === 'number') return 'spinbutton';
      if (t === 'search') return 'searchbox';
      if (t === 'range') return 'slider';
      return t === 'password' ? 'password' : 'textbox';
    }
    return 'generic';
  };
  const nameOf = (el: Element): string => {
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent)
        .join(' ');
      if (clean(t)) return clean(t);
    }
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
    ) {
      const label = el.labels?.[0]?.textContent;
      if (clean(label)) return clean(label);
      if (el instanceof HTMLInputElement && ['submit', 'button', 'reset'].includes(el.type))
        return clean(el.value);
      return clean(el.getAttribute('placeholder')) || clean(el.title);
    }
    return (
      clean(el.textContent) ||
      clean(el.getAttribute('title')) ||
      clean(el.querySelector('img')?.alt)
    );
  };
  const out: RawElement[] = [];
  for (const el of Array.from(document.querySelectorAll(selector))) {
    if (!visible(el)) continue;
    const input = el instanceof HTMLInputElement ? el : null;
    const isPassword = input?.type === 'password';
    out.push({
      role: roleOf(el),
      name: nameOf(el),
      text: clean(el.textContent).slice(0, 80),
      enabled: !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true',
      checked:
        input && (input.type === 'checkbox' || input.type === 'radio') ? input.checked : null,
      value:
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
          ? el.value.slice(0, 80)
          : null,
      isPassword,
    });
  }
  return out;
}

function pageState(): { text: string; busy: boolean } {
  const text = document.body.innerText.replace(/\n{3,}/g, '\n\n').trim();
  const busy =
    document.querySelector('[aria-busy="true"]') !== null ||
    /\b(loading|please wait)\b/i.test(text.slice(0, 2000));
  return { text, busy };
}

/** Browser driver on Playwright, with the staging-only, allow-list and gentleness rules built in. */
export class PlaywrightDriver implements BrowserDriver {
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private page: Page | undefined;
  private signals: DriverSignal[] = [];
  private refs = new Map<string, TargetSpec>();
  private readonly allowedOrigins: Set<string>;
  private readonly base: URL;
  private lastRequestAt = 0;
  private requests = 0;
  private serverErrors = 0;
  private blocked = 0;
  private shots: string[] = [];
  private videoPath: string | undefined;
  private tracePath: string | undefined;

  constructor(private readonly opts: PlaywrightDriverOptions) {
    this.base = checkTestUrl(opts.baseUrl, opts.urlPolicy);
    this.allowedOrigins = new Set([this.base.origin, ...(opts.extraAllowedOrigins ?? [])]);
  }

  async start(): Promise<void> {
    const o = this.opts;
    await mkdir(join(o.evidenceDir, 'screenshots'), { recursive: true });
    this.browser = await chromium.launch({
      headless: o.headless ?? true,
      ...(o.executablePath ? { executablePath: o.executablePath } : {}),
    });
    const record = o.record ?? true;
    this.context = await this.browser.newContext({
      viewport: o.viewport ?? { width: 1280, height: 800 },
      ...(record
        ? { recordVideo: { dir: join(o.evidenceDir, 'video'), size: { width: 1280, height: 800 } } }
        : {}),
    });
    this.context.setDefaultTimeout(o.actionTimeoutMs ?? 10_000);
    this.context.setDefaultNavigationTimeout(o.navigationTimeoutMs ?? 30_000);
    if (record) await this.context.tracing.start({ screenshots: true, snapshots: true });
    // Bundlers such as esbuild (tsx) wrap named functions in a __name() helper. Functions sent to the page
    // via evaluate() would then throw "__name is not defined", so provide a no-op.
    await this.context.addInitScript('globalThis.__name = globalThis.__name || ((fn) => fn);');
    await this.context.route('**/*', (route) => this.guardRequest(route.request(), route));
    const page = await this.context.newPage();
    this.page = page;
    page.on('pageerror', (e) => {
      this.signal({ kind: 'page-error', message: `${e.name}: ${e.message}`, url: page.url() });
    });
    page.on('console', (m) => {
      if (m.type() === 'error')
        this.signal({ kind: 'console-error', message: m.text(), url: page.url() });
    });
    page.on('response', (r) => {
      this.requests++;
      const status = r.status();
      if (status >= 500) {
        this.serverErrors++;
        this.signal({
          kind: 'http-5xx',
          message: `${String(status)} from ${r.url()}`,
          url: r.url(),
          status,
        });
      } else if (status === 404 && r.request().isNavigationRequest()) {
        this.signal({
          kind: 'page-not-found',
          message: `Page not found: ${r.url()}`,
          url: r.url(),
          status,
        });
      }
    });
    page.on('requestfailed', (r) => {
      const err = r.failure()?.errorText ?? 'failed';
      if (err.includes('BLOCKEDBYCLIENT')) return;
      this.signal({ kind: 'request-failed', message: `${err}: ${r.url()}`, url: r.url() });
    });
    await page.goto(this.base.href, { waitUntil: 'domcontentloaded' });
  }

  private signal(s: Omit<DriverSignal, 'at'>): void {
    this.signals.push({ ...s, at: new Date().toISOString() });
  }

  private async guardRequest(req: Request, route: Route): Promise<void> {
    const url = req.url();
    const blockedPath = this.blockedPath(url);
    if (!isRequestAllowed(url, this.allowedOrigins) || blockedPath) {
      this.blocked++;
      this.signal({
        kind: 'blocked-request',
        message: blockedPath ? `Blocked page: ${url}` : `Request outside the allow-list: ${url}`,
        url,
      });
      await route.abort('blockedbyclient');
      return;
    }
    const gap = this.opts.minRequestIntervalMs ?? 50;
    const wait = this.lastRequestAt + gap - Date.now();
    this.lastRequestAt = Math.max(Date.now(), this.lastRequestAt + gap);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    await route.continue();
  }

  private blockedPath(url: string): boolean {
    try {
      const p = new URL(url).pathname;
      return (this.opts.blockedPaths ?? []).some((b) => p.startsWith(b));
    } catch {
      return false;
    }
  }

  private get pg(): Page {
    if (!this.page) throw new Error('Driver not started');
    return this.page;
  }

  /** Observes the page, retrying when a navigation starts mid-read (a normal race after clicks). */
  async observe(): Promise<Observation> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.pg.waitForLoadState('domcontentloaded');
        return await this.observeOnce();
      } catch (e) {
        const navigating =
          e instanceof Error &&
          /context was destroyed|navigat|page\.screenshot: (Timeout|Protocol error)|Unable to capture screenshot/i.test(
            e.message,
          );
        if (!navigating || attempt >= 4) throw e;
      }
    }
  }

  private async observeOnce(): Promise<Observation> {
    const page = this.pg;
    const urlBefore = page.url();
    const raw = await page.evaluate(collectElements);
    const state = await page.evaluate(pageState);
    const counts = new Map<string, number>();
    const elements: ElementInfo[] = [];
    this.refs = new Map();
    for (const r of raw) {
      if (!r.name && r.role === 'generic') continue;
      const label = r.role === 'password';
      const key = `${r.role}|${r.name}`;
      const nth = counts.get(key) ?? 0;
      counts.set(key, nth + 1);
      if (elements.length >= MAX_ELEMENTS) continue;
      const ref = `e${String(elements.length + 1)}`;
      const target: TargetSpec = label
        ? { by: 'label', name: r.name, nth }
        : { by: 'role', role: r.role, name: r.name, nth };
      this.refs.set(ref, target);
      elements.push({
        ref,
        role: r.role === 'password' ? 'textbox (password)' : r.role,
        name: r.name,
        text: r.text,
        enabled: r.enabled,
        ...(r.checked !== null ? { checked: r.checked } : {}),
        ...(r.value && !r.isPassword ? { value: r.value } : {}),
        target,
      });
    }
    const screenshot = await page.screenshot({
      type: 'png',
      timeout: 5000,
      animations: 'disabled',
    });
    const title = await page.title();
    // text, elements and URL must describe the same page: retry if a navigation slipped in
    if (page.url() !== urlBefore) throw new Error('navigation during observe');
    return {
      url: urlBefore,
      title,
      visibleText: state.text.slice(0, MAX_TEXT),
      elements,
      screenshot,
      blank: state.text.length === 0 && raw.length === 0,
      busy: state.busy,
    };
  }

  private locate(t: TargetSpec): Locator {
    const page = this.pg;
    const base =
      t.by === 'label'
        ? page.getByLabel(t.name, { exact: true })
        : page.getByRole(t.role as Parameters<Page['getByRole']>[0], { name: t.name, exact: true });
    return base.nth(t.nth);
  }

  private resolve(ref: string): TargetSpec {
    const t = this.refs.get(ref);
    if (!t)
      throw new ElementNotFoundError(
        `${ref} (observe the page first; refs change after each observation)`,
      );
    return t;
  }

  private async settle(): Promise<void> {
    await this.pg.waitForLoadState('domcontentloaded').catch(() => undefined);
    await this.pg.waitForLoadState('networkidle', { timeout: 1000 }).catch(() => undefined);
  }

  async click(ref: string): Promise<Action> {
    const action: Action = { kind: 'click', target: this.resolve(ref) };
    await this.perform(action);
    return action;
  }

  async type(ref: string, text: string): Promise<Action> {
    const action: Action = { kind: 'type', target: this.resolve(ref), text };
    await this.perform(action);
    return action;
  }

  async navigate(path: string): Promise<Action> {
    const action: Action = { kind: 'navigate', path };
    await this.perform(action);
    return action;
  }

  async scroll(direction: ScrollDirection): Promise<Action> {
    const action: Action = { kind: 'scroll', direction };
    await this.perform(action);
    return action;
  }

  async wait(condition: WaitCondition): Promise<Action> {
    const action: Action = { kind: 'wait', condition };
    await this.perform(action);
    return action;
  }

  async perform(action: Action): Promise<void> {
    const page = this.pg;
    switch (action.kind) {
      case 'navigate': {
        const url = new URL(action.path, this.base);
        if (!this.allowedOrigins.has(url.origin))
          throw new NavigationBlockedError(url.href, 'outside the staging origin');
        if (this.blockedPath(url.href)) throw new NavigationBlockedError(url.href, 'blocked page');
        await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        break;
      }
      case 'click': {
        const loc = this.locate(action.target);
        if ((await loc.count()) === 0) throw new ElementNotFoundError(describe(action.target));
        await loc.click();
        await this.settle();
        break;
      }
      case 'type': {
        const loc = this.locate(action.target);
        if ((await loc.count()) === 0) throw new ElementNotFoundError(describe(action.target));
        const isSelect = await loc.evaluate((el) => el.tagName === 'SELECT');
        if (isSelect) await loc.selectOption({ label: action.text });
        else await loc.fill(action.text);
        break;
      }
      case 'scroll':
        await page.evaluate((d) => {
          const step = window.innerHeight * 0.8;
          if (d === 'top') window.scrollTo(0, 0);
          else if (d === 'bottom') window.scrollTo(0, document.body.scrollHeight);
          else window.scrollBy(0, d === 'down' ? step : -step);
        }, action.direction);
        break;
      case 'wait': {
        const c = action.condition;
        if (c.kind === 'text') {
          await page
            .getByText(c.text)
            .first()
            .waitFor({ state: 'visible', timeout: Math.min(c.timeoutMs ?? 5000, 10_000) });
        } else if (c.kind === 'idle') {
          await page.waitForLoadState('networkidle', {
            timeout: Math.min(c.timeoutMs ?? 5000, 10_000),
          });
        } else {
          await page.waitForTimeout(Math.min(c.ms, 5000));
        }
        break;
      }
    }
  }

  async saveScreenshot(label: string): Promise<string> {
    const safe = label.replace(/[^\w.-]+/g, '_').slice(0, 60);
    const path = join(
      this.opts.evidenceDir,
      'screenshots',
      `${String(this.shots.length + 1).padStart(3, '0')}-${safe}.png`,
    );
    await writeFile(path, await this.pg.screenshot({ type: 'png', timeout: 10_000 }));
    this.shots.push(path);
    return path;
  }

  drainSignals(): readonly DriverSignal[] {
    const s = this.signals;
    this.signals = [];
    return s;
  }

  stats(): DriverStats {
    return {
      requests: this.requests,
      serverErrors: this.serverErrors,
      blockedRequests: this.blocked,
    };
  }

  async stop(): Promise<DriverArtifacts> {
    const video = this.page?.video();
    if (this.context && (this.opts.record ?? true)) {
      this.tracePath = join(this.opts.evidenceDir, 'trace.zip');
      await this.context.tracing.stop({ path: this.tracePath }).catch(() => {
        this.tracePath = undefined;
      });
    }
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    if (video) this.videoPath = await video.path().catch(() => undefined);
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
    return {
      ...(this.videoPath ? { videoPath: this.videoPath } : {}),
      ...(this.tracePath ? { tracePath: this.tracePath } : {}),
      screenshots: this.shots,
    };
  }
}

function describe(t: TargetSpec): string {
  return t.by === 'label' ? `field "${t.name}"` : `${t.role} "${t.name}"`;
}
