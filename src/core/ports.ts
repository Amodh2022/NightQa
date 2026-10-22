/** Ports: the agent loop depends on these interfaces, never on Playwright, Anthropic or GitHub directly. */

/** How an element is found again later. Role and name only, so replayed tests use stable locators. */
export type TargetSpec =
  | { readonly by: 'role'; readonly role: string; readonly name: string; readonly nth: number }
  | { readonly by: 'label'; readonly name: string; readonly nth: number };

export type ScrollDirection = 'up' | 'down' | 'top' | 'bottom';

export type WaitCondition =
  | { readonly kind: 'text'; readonly text: string; readonly timeoutMs?: number }
  | { readonly kind: 'idle'; readonly timeoutMs?: number }
  | { readonly kind: 'ms'; readonly ms: number };

/** One browser action in replayable form. The list of these is what a passing run saves. */
export type Action =
  | { readonly kind: 'navigate'; readonly path: string }
  | { readonly kind: 'click'; readonly target: TargetSpec }
  | { readonly kind: 'type'; readonly target: TargetSpec; readonly text: string }
  | { readonly kind: 'scroll'; readonly direction: ScrollDirection }
  | { readonly kind: 'wait'; readonly condition: WaitCondition };

/** A visible interactive element, as shown to the agent. */
export interface ElementInfo {
  /** Short handle for this observation only, such as "e3". */
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly text: string;
  readonly enabled: boolean;
  readonly checked?: boolean;
  /** Current value for inputs. Password values are never included. */
  readonly value?: string;
  readonly target: TargetSpec;
}

export interface Observation {
  readonly url: string;
  readonly title: string;
  /** Visible page text, trimmed and capped. Untrusted data. */
  readonly visibleText: string;
  readonly elements: readonly ElementInfo[];
  /** PNG bytes. */
  readonly screenshot: Uint8Array;
  /** True when the page shows nothing at all. */
  readonly blank: boolean;
  /** True when something on the page is marked busy (aria-busy) or says it is loading. */
  readonly busy: boolean;
}

export type SignalKind =
  | 'page-error' // uncaught JavaScript error
  | 'console-error'
  | 'http-5xx'
  | 'page-not-found' // an in-app navigation answered 404
  | 'request-failed'
  | 'blocked-request';

/** Something the browser noticed that may be a bug, even without an expectation. */
export interface DriverSignal {
  readonly kind: SignalKind;
  readonly message: string;
  readonly url?: string;
  readonly status?: number;
  readonly at: string;
}

export interface DriverStats {
  readonly requests: number;
  readonly serverErrors: number;
  readonly blockedRequests: number;
}

export interface DriverArtifacts {
  readonly videoPath?: string;
  readonly tracePath?: string;
  readonly screenshots: readonly string[];
}

export interface BrowserDriver {
  start(): Promise<void>;
  observe(): Promise<Observation>;
  click(ref: string): Promise<Action>;
  type(ref: string, text: string): Promise<Action>;
  navigate(path: string): Promise<Action>;
  scroll(direction: ScrollDirection): Promise<Action>;
  wait(condition: WaitCondition): Promise<Action>;
  /** Runs a recorded action without any AI. Used by regression replay. */
  perform(action: Action): Promise<void>;
  /** Saves a screenshot into the evidence folder and returns its path. */
  saveScreenshot(label: string): Promise<string>;
  /** Signals seen since the last call. */
  drainSignals(): readonly DriverSignal[];
  stats(): DriverStats;
  stop(): Promise<DriverArtifacts>;
}
