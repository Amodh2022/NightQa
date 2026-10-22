import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { pathToFileURL } from 'node:url';
import { parseBugSelection } from './bugs.js';
import {
  PRODUCTS,
  cartPage,
  checkoutPage,
  confirmationPage,
  loginPage,
  ordersPage,
  productListPage,
  productPage,
  searchPage,
  simplePage,
} from './pages.js';

export interface ZooHandle {
  readonly url: string;
  readonly bugs: ReadonlySet<string>;
  close(): Promise<void>;
}

const REVIEWS = [
  { who: 'Asha', text: 'Fits well.' },
  { who: 'Ravi', text: 'Good quality for the price.' },
];

/** Writes a response. Returns true so route handlers can `return` it. */
function send(res: ServerResponse, status: number, type: string, body: string): true {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8` });
  res.end(body);
  return true;
}
const html = (res: ServerResponse, body: string, status = 200): true =>
  send(res, status, 'text/html', body);
const json = (res: ServerResponse, value: unknown, status = 200): true =>
  send(res, status, 'application/json', JSON.stringify(value));

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Starts the demo shop. Bugs come from `ZOO_BUGS` ("all", "none" or "B01,B04") unless passed in.
 * Port 0 picks a free port.
 */
export async function startZoo(
  opts: { port?: number; bugs?: ReadonlySet<string> } = {},
): Promise<ZooHandle> {
  const bugs = opts.bugs ?? parseBugSelection(process.env.ZOO_BUGS);
  const user = process.env.ZOO_TEST_USER ?? 'test-buyer@example.com';
  const pass = process.env.ZOO_TEST_PASSWORD ?? 'zoo-pass';
  let nextOrder = 1001;
  const sockets = new Set<Socket>();

  const server: Server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      send(res, 500, 'text/plain', 'Internal error');
    });
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://zoo.local');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (method === 'GET') {
      if (path === '/' || path === '/products') return html(res, productListPage(bugs));
      const prod = /^\/product\/([\w-]+)$/.exec(path);
      if (prod) {
        const p = PRODUCTS.find((x) => x.id === prod[1]);
        return p
          ? html(res, productPage(p, bugs))
          : html(res, simplePage('Page not found', 'No such product.', bugs), 404);
      }
      if (path === '/cart') return html(res, cartPage(bugs));
      if (path === '/checkout') return html(res, checkoutPage(bugs));
      if (path === '/confirmation') return html(res, confirmationPage(bugs));
      if (path === '/orders') return html(res, ordersPage(bugs));
      if (path === '/search') return html(res, searchPage(bugs));
      if (path === '/login') return html(res, loginPage(bugs));
      if (path === '/returns') {
        return bugs.has('B05')
          ? html(res, simplePage('Page not found', 'We could not find that page.', bugs), 404)
          : html(res, simplePage('Returns policy', 'Returns are accepted within 30 days.', bugs));
      }
      const rev = /^\/api\/reviews\/([\w-]+)$/.exec(path);
      if (rev) {
        if (bugs.has('B07')) return true; // never answers: the page's spinner never ends
        return json(res, REVIEWS);
      }
      if (path === '/api/search') {
        const q = (url.searchParams.get('q') ?? '').toLowerCase();
        if (bugs.has('B04') && q.includes('&')) return json(res, { error: 'boom' }, 500);
        return json(
          res,
          PRODUCTS.filter((p) => p.name.toLowerCase().includes(q)),
        );
      }
      if (path === '/api/coupon') {
        const code = (url.searchParams.get('code') ?? '').trim().toUpperCase();
        if (code === 'SAVE10') return json(res, { ok: true, percent: 10 });
        if (code === 'EXPIRED50') {
          return bugs.has('B01')
            ? json(res, { ok: true, percent: 50 })
            : json(res, { ok: false, message: 'Coupon EXPIRED50 has expired' });
        }
        return json(res, { ok: false, message: 'Coupon not found' });
      }
      return html(res, simplePage('Page not found', 'We could not find that page.', bugs), 404);
    }

    if (method === 'POST' && path === '/api/pay') {
      const body = await readJson(req);
      const card = typeof body.card === 'string' ? body.card : '';
      if (card.endsWith('0002')) return json(res, { ok: false, message: 'Card declined' });
      const id = `ORD-${String(nextOrder++)}`;
      return json(res, { ok: true, orderId: id, orderNumber: undefined, total: body.total });
    }
    if (method === 'POST' && path === '/api/login') {
      const body = await readJson(req);
      return body.email === user && body.password === pass
        ? json(res, { ok: true, name: 'test-buyer' })
        : json(res, { ok: false, message: 'Wrong email or password' });
    }
    return send(res, 405, 'text/plain', 'Method not allowed');
  }

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    bugs,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const s of sockets) s.destroy();
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const port = Number(process.env.PORT ?? 4010);
  startZoo({ port }).then(
    (z) => {
      console.log(`ZooShop running at ${z.url} with bugs: ${[...z.bugs].join(', ') || 'none'}`);
      const stop = (): void => {
        void z.close().then(() => process.exit(0));
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    },
    (e: unknown) => {
      console.error(e);
      process.exit(1);
    },
  );
}
