export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface ZooBug {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  /** How the agent should notice it: an expectation failure, or an always-a-bug signal. */
  readonly signal: 'expectation' | 'js-error' | 'http-5xx' | 'blank-page' | 'spinner' | 'dead-link';
}

/** The ten deliberately seeded bugs. Keep in sync with BUGS.md (the answer key). */
export const BUG_CATALOG: readonly ZooBug[] = [
  {
    id: 'B01',
    title: 'Expired coupon is accepted at checkout',
    severity: 'high',
    signal: 'expectation',
  },
  { id: 'B02', title: 'Cart total ignores quantity', severity: 'high', signal: 'expectation' },
  {
    id: 'B03',
    title: 'Add to wishlist throws an uncaught error',
    severity: 'low',
    signal: 'js-error',
  },
  {
    id: 'B04',
    title: 'Search with an ampersand returns a server error',
    severity: 'high',
    signal: 'http-5xx',
  },
  {
    id: 'B05',
    title: 'Returns policy link leads to page not found',
    severity: 'medium',
    signal: 'dead-link',
  },
  { id: 'B06', title: 'Order history page is blank', severity: 'medium', signal: 'blank-page' },
  { id: 'B07', title: 'Product reviews spinner never ends', severity: 'medium', signal: 'spinner' },
  {
    id: 'B08',
    title: 'Chosen size is ignored: cart gets size L',
    severity: 'high',
    signal: 'expectation',
  },
  {
    id: 'B09',
    title: 'Pay button stays disabled for a card number with spaces',
    severity: 'critical',
    signal: 'expectation',
  },
  {
    id: 'B10',
    title: 'Confirmation shows order number "undefined"',
    severity: 'high',
    signal: 'expectation',
  },
];

export const ALL_BUG_IDS: readonly string[] = BUG_CATALOG.map((b) => b.id);

/** Parses ZOO_BUGS: "all" (default), "none", or a comma list such as "B01,B04". */
export function parseBugSelection(value: string | undefined): ReadonlySet<string> {
  const v = (value ?? 'all').trim().toLowerCase();
  if (v === 'all' || v === '') return new Set(ALL_BUG_IDS);
  if (v === 'none') return new Set();
  const wanted = v.split(',').map((s) => s.trim().toUpperCase());
  const unknown = wanted.filter((id) => !ALL_BUG_IDS.includes(id));
  if (unknown.length > 0) throw new Error(`Unknown zoo bug id(s): ${unknown.join(', ')}`);
  return new Set(wanted);
}
