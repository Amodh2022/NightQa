import type { CSSProperties } from 'react';
import { SCREEN_ROUTES } from './routes';

/** Base class the design components' logic extends (props = design tweaks like `accent`). */
export class DCLogic {
  props: { accent?: string; active?: string };
  constructor(props: { accent?: string; active?: string }) {
    this.props = props;
  }
}

function splitDeclarations(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0 && !quote) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Turns an inline CSS string from the design into a React style object. */
export function css(s: string): CSSProperties {
  const style: Record<string, string> = {};
  for (const decl of splitDeclarations(s)) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const val = decl.slice(i + 1).trim();
    if (!prop || !val) continue;
    const key = prop.startsWith('--')
      ? prop
      : prop.replace(/^-(\w)/, (_, c: string) => c.toUpperCase()).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[key] = val;
  }
  return style as CSSProperties;
}

/** Maps design links like "Bug.dc.html#x" to app routes. */
export function route(href: string): string {
  const [file, hash] = href.split('#');
  const r = file ? SCREEN_ROUTES[file] : undefined;
  return r ? r + (hash ? '#' + hash : '') : href;
}
