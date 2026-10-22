import type { AiClient, DecideRequest, DecideResult, RawToolCall } from '../src/core/ports.js';

interface El {
  ref: string;
  role: string;
  name: string;
  enabled: boolean;
  value: string;
}

function parseElements(text: string): El[] {
  const out: El[] = [];
  for (const line of text.split('\n')) {
    const m = /^(e\d+) \| ([^|]+) \| "((?:[^"\\]|\\.)*)" \| ([^\n]*)$/.exec(line);
    if (!m?.[1] || !m[2] || m[3] === undefined || m[4] === undefined) continue;
    const value = /value="((?:[^"\\]|\\.)*)"/.exec(m[4])?.[1] ?? '';
    out.push({
      ref: m[1],
      role: m[2].trim(),
      name: m[3],
      enabled: m[4].startsWith('enabled'),
      value,
    });
  }
  return out;
}

/**
 * A deterministic stand-in for the model: reads the same prompt the real model sees and plays the ZooShop
 * checkout flow. Lets us test the whole pipeline (browser, loop, results) without network or cost.
 */
export class ZooCheckoutAi implements AiClient {
  calls = 0;

  decide(req: DecideRequest): Promise<DecideResult> {
    this.calls++;
    return Promise.resolve({
      reasoning: 'scripted',
      call: this.choose(req.userText),
      usage: { inputTokens: 1500, outputTokens: 60 },
      costUsd: 0.002,
      model: 'scripted-zoo-ai',
    });
  }

  private choose(t: string): RawToolCall {
    const step = Number(/CURRENT STEP (\d+)/.exec(t)?.[1] ?? '0');
    const path = new URL(/PAGE: (\S+)/.exec(t)?.[1] ?? 'http://x/').pathname;
    const page =
      /<untrusted_page_content>\n([\s\S]*?)\n<\/untrusted_page_content>/.exec(t)?.[1] ?? '';
    const els = parseElements(t);
    const find = (role: string, name: string): El | undefined =>
      els.find((e) => e.role === role && e.name === name);
    const click = (e: El | undefined): RawToolCall =>
      e
        ? { name: 'click', input: { target: e.ref } }
        : { name: 'stuck', input: { reason: 'element missing' } };
    const type = (e: El | undefined, text: string): RawToolCall =>
      e
        ? { name: 'type', input: { target: e.ref, text } }
        : { name: 'stuck', input: { reason: 'field missing' } };
    const expect = (
      ok: boolean,
      statement: string,
      evidence: string,
      visible: string[] = [],
      proof: { visible?: string[]; missing?: string[]; disabled?: string[] } = {},
    ): RawToolCall => ({
      name: 'expect',
      input: {
        statement,
        result: ok ? 'pass' : 'fail',
        evidence,
        ...(ok
          ? { visible_text: visible }
          : {
              ...(proof.visible ? { visible_text: proof.visible } : {}),
              ...(proof.missing ? { missing_text: proof.missing } : {}),
              ...(proof.disabled ? { disabled_controls: proof.disabled } : {}),
            }),
      },
    });

    if (step === 1) {
      if (path === '/products') return click(find('link', 'Blue T-shirt'));
      if (!path.startsWith('/product/')) return { name: 'navigate', input: { path: '/products' } };
      const size = find('combobox', 'Size');
      if (size?.value !== 'M') return type(size, 'M');
      if (!page.includes('Added Blue T-shirt')) return click(find('button', 'Add to cart'));
      return expect(true, 'the T-shirt was added', 'status says Added Blue T-shirt to the cart', [
        'Added Blue T-shirt to the cart',
      ]);
    }
    if (step === 2) {
      if (path !== '/cart') return { name: 'navigate', input: { path: '/cart' } };
      const ok =
        page.includes('Cart shows 1 item') &&
        page.includes('size M') &&
        page.includes('Total: $49.00');
      return expect(
        ok,
        'cart shows 1 item, size M, total $49.00',
        ok
          ? 'the cart page shows all three'
          : `the cart page says: ${page.replace(/\n/g, ' ').slice(0, 120)}`,
        ['Cart shows 1 item', 'size M', 'Total: $49.00'],
        {
          missing: ['Cart shows 1 item', 'size M', 'Total: $49.00'].filter(
            (x) => !page.includes(x),
          ),
        },
      );
    }
    if (path === '/cart') return click(find('link', 'Checkout'));
    if (path === '/checkout') {
      const card = find('textbox', 'Card number');
      const exp = find('textbox', 'Expiry (MM/YY)');
      const cvc = find('textbox', 'CVC');
      if (card?.value === '') return type(card, '4242 4242 4242 4242');
      if (exp?.value === '') return type(exp, '12/30');
      if (cvc?.value === '') return type(cvc, '123');
      const pay = find('button', 'Pay now');
      if (!pay?.enabled)
        return expect(
          false,
          'the order is paid',
          'the Pay now button stays disabled after entering a valid card',
          [],
          { disabled: ['Pay now'] },
        );
      return click(pay);
    }
    if (path === '/confirmation') {
      const ok = /order number is ORD-\d+/.test(page);
      return expect(
        ok,
        'the confirmation page shows an order number',
        `the page says: ${page.replace(/\n/g, ' ').slice(0, 120)}`,
        ['Your order number is ORD-'],
        { visible: ['Your order number is undefined'].filter((x) => page.includes(x)) },
      );
    }
    return { name: 'stuck', input: { reason: `unexpected page ${path}` } };
  }
}
