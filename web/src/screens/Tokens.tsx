// Hand-maintained (not generated). Design-token reference sheet from design/source/Tokens.dc.html.
// Static documentation of the design system; sample values are placeholders, not measurements.
import type { ReactNode } from 'react';
import { css } from '@/lib/dc';

const DEFAULT_ACCENT = '#34E3CB';

export interface TokensProps {
  accent?: string;
  active?: string;
}

interface Titled {
  title: string;
  text: string;
}
interface Swatch {
  name: string;
  hex: string;
  use: string;
  bg: string;
  border?: boolean;
}
interface TypeSpec {
  spec: string;
  sample: string;
  style: string;
}
interface Depth {
  name: string;
  note: string;
  style: string;
}
interface Chip {
  label: string;
  fg: string;
  bg: string;
}

const PRINCIPLES: readonly Titled[] = [
  { title: 'Night as a signature', text: 'Moon, stars and constellations tell the story of the night. Use them once per screen.' },
  { title: 'Proof before polish', text: 'Replay, network call and failing test are one click from any bug.' },
  { title: 'Glow means attention', text: 'Only items that need a person glow. Everything else stays calm.' },
  { title: 'Never color alone', text: 'Every status has a text label. Severity also differs in fill.' },
  { title: 'Ready for thumbs', text: 'Touch targets are 44px or larger. Mobile is for reading and approving.' },
];

const COLORS: readonly Swatch[] = [
  { name: 'Ground', hex: '#070A10', use: 'Page background', bg: '#070A10', border: true },
  { name: 'Card', hex: '#0B1019', use: 'Panels, with a white 5% to 2% fade', bg: '#0B1019', border: true },
  { name: 'Hairline', hex: 'white 9%', use: 'Card borders. Inner top edge is white 6 to 8%', bg: 'rgba(255,255,255,0.09)' },
  { name: 'Text', hex: '#EAF0FA', use: '16.6:1 on card', bg: '#EAF0FA' },
  { name: 'Soft text', hex: '#B4BFD2', use: '10.3:1 on card', bg: '#B4BFD2' },
  { name: 'Muted text', hex: '#A3AEC2', use: '8.5:1 on card', bg: '#A3AEC2' },
  { name: 'Faint text', hex: '#8E9BB2', use: '6.8:1 on card. Captions', bg: '#8E9BB2' },
  { name: 'Dim', hex: '#6F7C94', use: 'About 4.5:1. Decorative or disabled only', bg: '#6F7C94' },
  { name: 'Moon · Pass', hex: '#34E3CB', use: '11.8:1. Dark text on it is 10.5:1', bg: '#34E3CB' },
  { name: 'Bug', hex: '#FF6B5B', use: 'Fills and glow. Text #FF8A7B is 8.3:1', bg: '#FF6B5B' },
  { name: 'Medium · Warning', hex: '#FFC14D', use: '11.8:1', bg: '#FFC14D' },
  { name: 'Aurora · AI', hex: '#8B7CFF', use: 'Needs setup, AI. Text #B9A6FF is 9.0:1', bg: '#8B7CFF' },
];

const TYPE: readonly TypeSpec[] = [
  { spec: 'Display 76 / 800', sample: 'Proven bugs', style: 'font-size:52px;font-weight:800;letter-spacing:-2.4px;line-height:1' },
  { spec: 'H1 42 / 800', sample: 'Every night, on the record', style: 'font-size:30px;font-weight:800;letter-spacing:-1.2px' },
  { spec: 'H2 20 / 800', sample: 'Flow constellation', style: 'font-size:20px;font-weight:800;letter-spacing:-0.4px' },
  { spec: 'Body 14.5 / 500', sample: 'Expired coupon is accepted at checkout', style: 'font-size:14.5px;font-weight:500' },
  { spec: 'Caption 12.5 / 600', sample: 'Chrome · Wi-Fi · 1280 × 800', style: 'font-size:12.5px;font-weight:600;color:#A3AEC2' },
  { spec: 'Mono 13 / 400', sample: 'POST /api/coupons/apply · 200', style: "font-family:'JetBrains Mono',monospace;font-size:13px" },
];

const DEPTH: readonly Depth[] = [
  { name: 'Card', note: 'White 5% fade, hairline border, inner top highlight', style: 'padding:16px 18px;border-radius:20px;border:1px solid rgba(255,255,255,0.09);background:linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015));box-shadow:inset 0 1px 0 rgba(255,255,255,0.08),0 24px 48px -28px rgba(0,0,0,0.9)' },
  { name: 'Hot card', note: 'Severity-colored border and outer glow', style: 'padding:16px 18px;border-radius:20px;border:1px solid rgba(255,107,91,0.55);background:linear-gradient(180deg,rgba(255,107,91,0.14),rgba(255,107,91,0.03));box-shadow:0 0 44px -14px rgba(255,107,91,0.65),inset 0 1px 0 rgba(255,255,255,0.08)' },
  { name: 'Moon card', note: 'Primary focus: teal border and glow', style: 'padding:16px 18px;border-radius:20px;border:1px solid rgba(52,227,203,0.5);background:linear-gradient(180deg,rgba(52,227,203,0.11),rgba(52,227,203,0.02));box-shadow:0 0 60px -20px rgba(52,227,203,0.6),inset 0 1px 0 rgba(255,255,255,0.08)' },
  { name: 'Page glow', note: 'Two soft radial lights behind the content', style: 'padding:16px 18px;border-radius:20px;border:1px solid rgba(255,255,255,0.09);background:radial-gradient(300px 120px at 80% 0%,rgba(52,227,203,0.2),transparent 70%),radial-gradient(260px 120px at 0% 100%,rgba(139,124,255,0.18),transparent 70%),#0B1019' },
];

function chips(accent: string): readonly Chip[] {
  return [
    { label: 'Pass', fg: accent, bg: 'rgba(52,227,203,0.13)' },
    { label: 'Bug', fg: '#FF8A7B', bg: 'rgba(255,107,91,0.18)' },
    { label: 'App changed', fg: '#8DB8FF', bg: 'rgba(106,166,255,0.18)' },
    { label: 'Needs setup', fg: '#B9A6FF', bg: 'rgba(139,124,255,0.2)' },
    { label: 'Agent stuck', fg: '#B4BFD2', bg: 'rgba(142,155,178,0.2)' },
    { label: 'Critical', fg: '#FFFFFF', bg: '#FF6B5B' },
    { label: 'High', fg: '#FF8A7B', bg: 'rgba(255,107,91,0.18)' },
    { label: 'Medium', fg: '#FFC14D', bg: 'rgba(255,193,77,0.17)' },
    { label: 'Low', fg: '#C7D0E0', bg: 'rgba(255,255,255,0.1)' },
  ];
}

const H2 = 'margin:0 0 16px;font-size:20px;font-weight:800;letter-spacing:-0.4px';
const H2_TIGHT = 'margin:0 0 14px;font-size:20px;font-weight:800;letter-spacing:-0.4px';
const CARD_SURFACE =
  'border:1px solid rgba(255,255,255,0.09);background:linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015));box-shadow:inset 0 1px 0 rgba(255,255,255,0.08)';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 style={css(H2)}>{title}</h2>
      {children}
    </section>
  );
}

function Buttons({ accent }: { accent: string }) {
  const base = 'min-height:48px;font-family:inherit;font-size:15px;';
  return (
    <div style={css('display:flex;gap:12px;flex-wrap:wrap;align-items:center')}>
      <button type="button" style={css(`${base}padding:0 24px;border:0;border-radius:14px;background:${accent};color:#03211D;font-weight:800;box-shadow:0 10px 30px -8px rgba(52,227,203,0.7)`)}>Primary</button>
      <button type="button" style={css(`${base}padding:0 22px;border:1px solid rgba(255,255,255,0.18);border-radius:14px;background:rgba(255,255,255,0.05);color:#EAF0FA;font-weight:700`)}>Secondary</button>
      <button type="button" style={css(`${base}padding:0 22px;border:1px solid rgba(255,107,91,0.65);border-radius:14px;background:rgba(255,107,91,0.1);color:#FF8A7B;font-weight:800`)}>Danger</button>
      <button type="button" style={css(`${base}padding:0 18px;border:0;background:transparent;color:${accent};font-weight:800`)}>Ghost</button>
      <div style={css('width:1px;height:30px;background:rgba(255,255,255,0.15);margin:0 6px')} />
      <button type="button" role="switch" aria-checked="false" aria-label="Toggle off example" style={css('width:60px;height:44px;border:0;background:transparent;padding:0;display:flex;align-items:center')}>
        <span style={css('width:54px;height:30px;border-radius:99px;background:#2D384B;position:relative;display:block')}>
          <span style={css('position:absolute;left:4px;top:4px;width:22px;height:22px;border-radius:50%;background:#EAF0FA')} />
        </span>
      </button>
      <button type="button" role="switch" aria-checked="true" aria-label="Toggle on example" style={css('width:60px;height:44px;border:0;background:transparent;padding:0;display:flex;align-items:center')}>
        <span style={css(`width:54px;height:30px;border-radius:99px;background:${accent};position:relative;display:block;box-shadow:0 0 18px rgba(52,227,203,0.5)`)}>
          <span style={css('position:absolute;right:4px;top:4px;width:22px;height:22px;border-radius:50%;background:#03211D')} />
        </span>
      </button>
      <div style={css('display:flex;flex-direction:column;gap:6px;margin-left:10px')}>
        <label htmlFor="ex" style={css('font-size:12.5px;font-weight:700;color:#C7D0E0')}>Input</label>
        <input id="ex" defaultValue="test-buyer" style={css("min-height:48px;width:220px;box-sizing:border-box;padding:0 16px;border-radius:14px;border:1px solid rgba(255,255,255,0.16);background:#05080D;color:#EAF0FA;font-family:'JetBrains Mono',monospace;font-size:14px")} />
      </div>
    </div>
  );
}

function SampleCards({ accent }: { accent: string }) {
  return (
    <div style={css('display:flex;gap:18px;flex-wrap:wrap;align-items:stretch')}>
      <div style={css(`flex:1 1 280px;padding:20px 22px;border-radius:22px;${CARD_SURFACE}`)}>
        <div style={css('font-size:12.5px;color:#A3AEC2;font-weight:600')}>KPI card</div>
        <div style={css('font-size:38px;font-weight:800;letter-spacing:-1.6px;margin-top:4px')}>00%</div>
        <div style={css('font-size:12.5px;color:#A3AEC2;margin-top:2px')}>Metric label, period (sample value)</div>
      </div>
      <div style={css('flex:1 1 280px;padding:18px 20px;border-radius:22px;border:1px solid rgba(52,227,203,0.5);background:linear-gradient(180deg,rgba(52,227,203,0.11),rgba(52,227,203,0.02));box-shadow:0 0 60px -20px rgba(52,227,203,0.6),inset 0 1px 0 rgba(255,255,255,0.08)')}>
        <div style={css('font-size:15px;font-weight:800')}>Verification row</div>
        <div style={css('display:flex;gap:12px;align-items:center;padding:11px 0 2px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.08)')}>
          <span style={css(`flex:0 0 22px;height:22px;border-radius:50%;background:rgba(52,227,203,0.18);color:${accent};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800`)}>✓</span>
          <span style={css('flex:1;font-size:14px;font-weight:600')}>Check name</span>
          <span style={css("font-size:12.5px;color:#A3AEC2;font-family:'JetBrains Mono',monospace")}>n of n</span>
        </div>
      </div>
      <div style={css('flex:1 1 280px;padding:18px 20px;border-radius:22px;border:1px solid rgba(255,107,91,0.55);background:linear-gradient(180deg,rgba(255,107,91,0.14),rgba(255,107,91,0.03));box-shadow:0 0 46px -16px rgba(255,107,91,0.65),inset 0 1px 0 rgba(255,255,255,0.08)')}>
        <span style={css('font-size:12px;font-weight:800;color:#FF8A7B;background:rgba(255,107,91,0.18);padding:4px 11px;border-radius:99px')}>High</span>
        <div style={css('font-size:16px;font-weight:700;margin-top:12px;line-height:1.3')}>Needs-you card</div>
        <div style={css('font-size:12.5px;color:#B4BFD2;margin-top:4px')}>Hot cards glow in the severity color.</div>
      </div>
    </div>
  );
}

function Pins({ accent }: { accent: string }) {
  const pins: ReadonlyArray<readonly [string, string]> = [['1', '#6AA6FF'], ['2', '#FF6B5B'], ['3', accent], ['4', accent], ['5', '#EAF0FA']];
  return (
    <div style={css('display:flex;gap:22px;align-items:center;flex-wrap:wrap')}>
      <div style={css('display:flex;gap:14px;align-items:center')}>
        {pins.map(([n, c]) => (
          <div key={n} style={css(`width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800;color:#06121A;background:${c};box-shadow:0 0 18px ${c}99,0 0 0 4px rgba(7,10,16,0.9)`)}>{n}</div>
        ))}
      </div>
      <div style={css('font-size:13px;color:#A3AEC2')}>Timeline pins: run started, bug found, issue, PR verified, report sent</div>
    </div>
  );
}

export default function Tokens({ accent = DEFAULT_ACCENT }: TokensProps) {
  return (
    <div style={css("width:1100px;box-sizing:border-box;padding:52px 56px;font-family:'Manrope',system-ui,sans-serif;color:#EAF0FA;background:radial-gradient(900px 480px at 85% -100px,rgba(52,227,203,0.18),transparent 62%),radial-gradient(700px 480px at 0% 30%,rgba(139,124,255,0.13),transparent 62%),#070A10;display:flex;flex-direction:column;gap:38px")}>
      <header style={css('position:relative')}>
        <div style={css('display:flex;align-items:center;gap:12px')}>
          <div style={css(`width:32px;height:32px;border-radius:50%;background:${accent};position:relative;overflow:hidden;box-shadow:0 0 28px rgba(52,227,203,0.6)`)}>
            <div style={css('position:absolute;left:13px;top:-4px;width:30px;height:30px;border-radius:50%;background:#070A10')} />
          </div>
          <div style={css('font-size:20px;font-weight:800')}>NightQA design system · Moonlight</div>
        </div>
        <h1 style={css('margin:18px 0 8px;font-size:52px;line-height:1.02;font-weight:800;letter-spacing:-2px')}>Dark, deep and precise</h1>
        <div style={css('font-size:16px;color:#A3AEC2;max-width:720px;line-height:1.55')}>Tokens and components shared by the web app, mobile app and marketing site. Every text color below was checked for contrast on the card surface.</div>
      </header>

      <Section title="Principles">
        <div style={css('display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px')}>
          {PRINCIPLES.map((p) => (
            <div key={p.title} style={css(`padding:18px;border-radius:20px;${CARD_SURFACE}`)}>
              <div style={css('font-size:15px;font-weight:800;line-height:1.3')}>{p.title}</div>
              <div style={css('font-size:12.5px;color:#A3AEC2;margin-top:8px;line-height:1.5')}>{p.text}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Color">
        <div style={css('display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px')}>
          {COLORS.map((c) => (
            <div key={c.name} style={css('border:1px solid rgba(255,255,255,0.09);border-radius:18px;overflow:hidden;background:rgba(255,255,255,0.03)')}>
              <div style={css(`height:58px;background:${c.bg}${c.border ? ';border-bottom:1px solid rgba(255,255,255,0.1)' : ''}`)} />
              <div style={css('padding:12px 14px')}>
                <div style={css('font-size:13.5px;font-weight:800')}>{c.name}</div>
                <div style={css("font-family:'JetBrains Mono',monospace;font-size:12px;color:#A3AEC2;margin-top:2px")}>{c.hex}</div>
                <div style={css('font-size:12px;color:#A3AEC2;margin-top:5px;line-height:1.4')}>{c.use}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <section style={css('display:flex;gap:40px')}>
        <div style={css('flex:1.2;min-width:0')}>
          <h2 style={css(H2_TIGHT)}>Type · Manrope and JetBrains Mono</h2>
          <div style={css('display:flex;flex-direction:column')}>
            {TYPE.map((t) => (
              <div key={t.spec} style={css('display:flex;align-items:baseline;gap:16px;padding:11px 0;border-top:1px solid rgba(255,255,255,0.08)')}>
                <div style={css("flex:0 0 120px;font-size:12px;color:#A3AEC2;font-family:'JetBrains Mono',monospace")}>{t.spec}</div>
                <div style={css(t.style)}>{t.sample}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={css('flex:1;min-width:0')}>
          <h2 style={css(H2_TIGHT)}>Depth and glow</h2>
          <div style={css('display:flex;flex-direction:column;gap:14px')}>
            {DEPTH.map((d) => (
              <div key={d.name} style={css(d.style)}>
                <div style={css('font-size:14px;font-weight:800')}>{d.name}</div>
                <div style={css('font-size:12px;color:#B4BFD2;margin-top:3px')}>{d.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section title="Components">
        <div style={css('display:flex;flex-direction:column;gap:22px')}>
          <Buttons accent={accent} />
          <div style={css('display:flex;gap:8px;flex-wrap:wrap')}>
            {chips(accent).map((c) => (
              <span key={c.label} style={css(`font-size:12px;font-weight:800;color:${c.fg};background:${c.bg};padding:6px 13px;border-radius:99px`)}>{c.label}</span>
            ))}
          </div>
          <SampleCards accent={accent} />
          <Pins accent={accent} />
        </div>
      </Section>
    </div>
  );
}
