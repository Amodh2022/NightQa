// Converts design/source/*.dc.html (Design Component format) into React components.
// Markup, inline styles and renderVals() logic are carried over verbatim so the UI matches the design 1:1.
// Usage: node scripts/convert-design.mjs   (run from web/)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, '..', 'design', 'source');
const OUT = join(root, 'src', 'screens');
const APP = join(root, 'src', 'app');

// name -> [route, kind]  kind: web | mobile | fixed | component
const ROUTES = {
  Main: ['', 'web'], Runs: ['runs', 'web'], Run: ['run', 'web'], Bugs: ['bugs', 'web'], Bug: ['bug', 'web'],
  Flows: ['flows', 'web'], Editor: ['editor', 'web'], Import: ['import', 'web'], Explore: ['explore', 'web'],
  Profiles: ['profiles', 'web'], Autonomy: ['autonomy', 'web'], Settings: ['settings', 'web'],
  Billing: ['billing', 'web'], Setup: ['setup', 'web'], Reports: ['notifications', 'fixed'],
  Android: ['android', 'fixed'], Landing: ['landing', 'web'], Tokens: ['tokens', 'fixed'],
  Flow: ['user-flow', 'fixed'], MHome: ['m/home', 'mobile'], MBugs: ['m/bugs', 'mobile'],
  MBug: ['m/bug', 'mobile'], MRun: ['m/run', 'mobile'], MAlerts: ['m/alerts', 'mobile'],
  MSetup: ['m/setup', 'mobile'], Topbar: ['components/topbar', 'component'], TabBar: ['components/tab-bar', 'component'],
};

// Hand-maintained, data-driven screens. The converter never regenerates them (see src/screens/ and src/app/).
const LIVE = new Set(['Main', 'Runs', 'Run', 'Bugs', 'Flows', 'Editor', 'Import', 'Flow', 'Topbar', 'Android', 'Landing', 'TabBar', 'Tokens']);

const VOID = new Set(['br', 'input', 'img', 'hr', 'meta', 'link', 'wbr']);
const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
const camel = (n) => n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function attrName(n) {
  if (n === 'class') return 'className';
  if (n === 'for') return 'htmlFor';
  if (n === 'tabindex') return 'tabIndex';
  if (n.startsWith('aria-') || n.startsWith('data-')) return n;
  return n.includes('-') ? camel(n) : n;
}

function convert(file) {
  const name = file.replace('.dc.html', '');
  const html = readFileSync(join(SRC, file), 'utf8');
  const title = (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? `NightQA ${name}`;
  if (LIVE.has(name)) return { name, route: '/' + ROUTES[name][0], title, kind: ROUTES[name][1] };
  let body = html.match(/<x-dc>([\s\S]*)<\/x-dc>/)[1];
  body = body.replace(/<helmet>[\s\S]*?<\/helmet>/, '').replace(/<!--[\s\S]*?-->/g, '');
  const script = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1].trim();
  const props = JSON.parse(html.match(/data-props='([^']*)'/)[1]);

  const scope = []; // loop variables in scope
  const expr = (e) => {
    const root = e.split(/[.[]/)[0];
    return scope.includes(root) ? e : `v.${e}`;
  };
  const tpl = (s) => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(HOLE, (_, e) => '${' + expr(e) + '}') + '`';
  const strAttr = (val) => {
    const holes = [...val.matchAll(HOLE)];
    if (holes.length === 1 && holes[0][0] === val) return `{${expr(holes[0][1])}}`;
    if (holes.length) return `{${tpl(val)}}`;
    return `{${JSON.stringify(decode(val))}}`;
  };

  let out = '';
  let depth = 0;
  const stack = [];
  const tagRe = /<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(body))) {
    // raw text between tags; holes written as {{x}} contain braces, handle before escaping
    const raw = body.slice(last, m.index);
    last = tagRe.lastIndex;
    if (raw) {
      out += raw
        .split(HOLE)
        .map((part, i) => (i % 2 ? `{${expr(part)}}` : part.replace(/[{}]/g, (c) => `{'${c}'}`)))
        .join('');
    }
    const [, closing, tag, attrStr, selfClose] = m;
    if (closing) {
      const top = stack.pop();
      if (top === 'sc-for') {
        out += '</Fragment>))}';
        scope.pop();
        depth--;
      } else if (top === 'dc-import') {
        /* self-closed when opened */
      } else {
        out += `</${tag === 'a' ? 'Link' : tag}>`;
      }
      continue;
    }
    const attrs = [...attrStr.matchAll(/([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'))?/g)].map((a) => [a[1], a[2] ?? a[3] ?? true]);
    if (tag === 'sc-for') {
      const list = attrs.find((a) => a[0] === 'list')[1].replace(HOLE, '$1');
      const as = attrs.find((a) => a[0] === 'as')[1];
      out += `{(${expr(list)}).map((${as}, _i${depth}) => (<Fragment key={_i${depth}}>`;
      scope.push(as);
      depth++;
      stack.push('sc-for');
      continue;
    }
    if (tag === 'dc-import') {
      const nm = attrs.find((a) => a[0] === 'name')[1];
      const extra = attrs
        .filter((a) => !['name', 'hint-size', 'hint-placeholder'].includes(a[0]))
        .map(([k, val]) => `${attrName(k)}=${typeof val === 'string' ? JSON.stringify(val) : '{true}'}`)
        .join(' ');
      imports.add(nm);
      out += `<${nm} ${extra} accent={v.accent} />`;
      if (!selfClose) stack.push('dc-import');
      continue;
    }
    const jsxTag = tag === 'a' ? 'Link' : tag;
    const parts = attrs.map(([k, val]) => {
      let n = attrName(k);
      if (val === true) return n;
      if (k === 'style') return `style={css(${tpl(val)})}`;
      if (k === 'href') {
        const holes = [...val.matchAll(HOLE)];
        const e = holes.length === 1 && holes[0][0] === val ? expr(holes[0][1]) : holes.length ? tpl(val) : JSON.stringify(decode(val));
        return `href={route(${e})}`;
      }
      if (tag === 'input' && k === 'value') n = 'defaultValue';
      if (tag === 'input' && k === 'checked') n = 'defaultChecked';
      return `${n}=${strAttr(val)}`;
    });
    const isVoid = VOID.has(tag);
    out += `<${jsxTag}${parts.length ? ' ' + parts.join(' ') : ''}${isVoid || selfClose ? ' /' : ''}>`;
    if (!isVoid && !selfClose) stack.push(tag);
  }
  out += body.slice(last).replace(/[{}]/g, (c) => `{'${c}'}`);

  const [route, kind] = ROUTES[name];
  const cls = script.replace(/^class Component extends DCLogic/, 'class Component extends DCLogic');
  const imp = [...imports].map((i) => `import ${i} from './${i}';`).join('\n');
  imports.clear();
  const tsx = `// @ts-nocheck
// Generated by scripts/convert-design.mjs from design/source/${file}. Do not edit by hand.
/* eslint-disable */
import { Fragment } from 'react';
import Link from 'next/link';
import { DCLogic, css, route } from '@/lib/dc';
${imp}

${cls}

export default function ${name}Screen(props: { accent?: string; active?: string }) {
  const v = new Component(props).renderVals();
  return (
    <>
${out.trim()}
    </>
  );
}
`;
  writeFileSync(join(OUT, `${name}.tsx`), tsx);

  // route page
  const dir = join(APP, route);
  mkdirSync(dir, { recursive: true });
  const wrap = kind === 'mobile'
    ? `<div style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: '#070A10' }}><Screen /></div>`
    : kind === 'component' || kind === 'fixed'
      ? `<div style={{ background: '#070A10', minHeight: '100vh', overflowX: 'auto' }}><Screen /></div>`
      : `<Screen />`;
  writeFileSync(
    join(dir, 'page.tsx'),
    `import type { Metadata } from 'next';
import Screen from '@/screens/${name}';

export const metadata: Metadata = { title: ${JSON.stringify(title)} };

export default function Page() {
  return ${wrap};
}
`,
  );
  return { name, route: '/' + route, title, kind };
}

const imports = new Set();
mkdirSync(OUT, { recursive: true });
const files = readdirSync(SRC).filter((f) => f.endsWith('.dc.html'));
const list = files.filter((f) => ROUTES[f.replace('.dc.html', '')]).map(convert);

// route map used by href rewriting + screen gallery
writeFileSync(
  join(root, 'src', 'lib', 'routes.ts'),
  `// Generated by scripts/convert-design.mjs\nexport const SCREEN_ROUTES: Record<string, string> = ${JSON.stringify(Object.fromEntries(list.map((s) => [s.name + '.dc.html', s.route])), null, 2)};\n\nexport const SCREENS = ${JSON.stringify(list, null, 2)} as const;\n`,
);
console.log(`converted ${list.length} screens`);
