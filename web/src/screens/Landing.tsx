// Hand-maintained (not generated). Landing page from design/source/Landing.dc.html.
// Only claims the product delivers today; no statistics, customers, testimonials or pricing.
import Link from 'next/link';
import { css } from '@/lib/dc';

const DEFAULT_ACCENT = '#34E3CB';
const STARS = 'radial-gradient(1.4px 1.4px at 5% 12%, rgba(255,255,255,0.8), transparent), radial-gradient(1px 1px at 11% 48%, rgba(255,255,255,0.5), transparent), radial-gradient(1.2px 1.2px at 19% 22%, rgba(255,255,255,0.7), transparent), radial-gradient(1px 1px at 27% 70%, rgba(255,255,255,0.45), transparent), radial-gradient(1.4px 1.4px at 36% 9%, rgba(255,255,255,0.7), transparent), radial-gradient(1px 1px at 45% 38%, rgba(255,255,255,0.4), transparent), radial-gradient(1.2px 1.2px at 54% 16%, rgba(255,255,255,0.7), transparent), radial-gradient(1px 1px at 62% 62%, rgba(255,255,255,0.4), transparent), radial-gradient(1.4px 1.4px at 71% 28%, rgba(255,255,255,0.75), transparent), radial-gradient(1px 1px at 79% 80%, rgba(255,255,255,0.45), transparent), radial-gradient(1.2px 1.2px at 88% 14%, rgba(255,255,255,0.7), transparent), radial-gradient(1px 1px at 94% 52%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 8% 86%, rgba(255,255,255,0.4), transparent), radial-gradient(1.2px 1.2px at 40% 90%, rgba(255,255,255,0.5), transparent)';

export interface LandingProps {
  accent?: string;
  active?: string;
}

interface Stage {
  n: string;
  title: string;
  text: string;
}
interface Titled {
  title: string;
  text: string;
}

const STAGES: readonly Stage[] = [
  { n: '01', title: 'Find', text: 'Synthetic users run plain-language flows in a real browser and try risky variations.' },
  { n: '02', title: 'Prove', text: 'Each suspected bug is replayed three times, shortened, and turned into a Playwright test that fails.' },
  { n: '03', title: 'Fix', text: 'A GitHub issue with evidence is opened and your own coding agent is triggered to propose a fix pull request.' },
  { n: '04', title: 'Verify', text: 'CI re-runs the failing test and your regression suite. A person reviews and merges.' },
];

const TRUST: readonly Titled[] = [
  { title: 'Proof, not maybes', text: 'A bug is only reported if it reproduced 3 out of 3 times and a failing test was actually run and failed.' },
  { title: 'A human always decides', text: 'NightQA never merges anything. It opens the issue and triggers the fix pull request; you review and merge.' },
  { title: 'Cheap to replay', text: 'Replaying a confirmed bug uses recorded steps and makes zero AI calls.' },
];

const GUARANTEES: readonly string[] = [
  'Plain-language flows in a real browser',
  'Replays with zero AI calls',
  'Staging origins only, allow-listed',
  'Private and metadata addresses blocked',
  'Secrets never written to logs',
  'Fails closed when a check is unsure',
];

const STAGE_COLORS: readonly string[] = ['#6AA6FF', '#FF6B5B', '#FFC14D'];

const NAV_LINK = 'min-height:44px;display:inline-flex;align-items:center;padding:0 14px;font-size:14.5px;font-weight:600;color:#C7D0E0';
const H2 = 'margin:0 0 36px;font-size:48px;line-height:1.05;font-weight:800;letter-spacing:-1.8px';
const WRAP = 'max-width:1240px;margin:0 auto;box-sizing:border-box;padding:0 40px 96px';

function stageCard(color: string): string {
  return `padding:28px 26px;border-radius:26px;border:1px solid ${color}55;background:linear-gradient(180deg,${color}18,rgba(255,255,255,0.012));box-shadow:0 0 60px -26px ${color}99,inset 0 1px 0 rgba(255,255,255,0.07)`;
}
function stageNum(color: string): string {
  return `width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:JetBrains Mono,monospace;font-size:14px;font-weight:500;color:#070A10;background:${color};box-shadow:0 0 26px ${color}99`;
}

function Header({ accent }: { accent: string }) {
  return (
    <header style={css('position:relative;max-width:1240px;margin:0 auto;box-sizing:border-box;padding:24px 40px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px')}>
      <div style={css('display:flex;align-items:center;gap:11px')}>
        <div style={css(`width:30px;height:30px;border-radius:50%;background:${accent};position:relative;overflow:hidden;box-shadow:0 0 26px rgba(52,227,203,0.6)`)}>
          <div style={css('position:absolute;left:12px;top:-4px;width:28px;height:28px;border-radius:50%;background:#070A10')} />
        </div>
        <span style={css('font-size:20px;font-weight:800;letter-spacing:-0.5px')}>NightQA</span>
      </div>
      <nav aria-label="Site" style={css('display:flex;flex-wrap:wrap;gap:4px;align-items:center')}>
        <a href="#how" style={css(NAV_LINK)}>How it works</a>
        <a href="#trust" style={css(NAV_LINK)}>Trust</a>
        <Link href="/login" style={css(NAV_LINK)}>Sign in</Link>
        <Link href="/setup" style={css(`min-height:46px;box-sizing:border-box;display:inline-flex;align-items:center;padding:0 20px;border-radius:13px;background:${accent};color:#03211D;font-size:14.5px;font-weight:800;box-shadow:0 10px 30px -8px rgba(52,227,203,0.7)`)}>Get started</Link>
      </nav>
    </header>
  );
}

function ExampleCard() {
  return (
    <div style={css('position:relative;width:100%;max-width:440px;margin-top:150px;padding:24px;border-radius:26px;border:1px solid rgba(255,255,255,0.14);background:rgba(14,20,32,0.92);box-shadow:0 40px 80px -30px rgba(0,0,0,0.95),inset 0 1px 0 rgba(255,255,255,0.12)')}>
      <div style={css('display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px')}>
        <span style={css('font-size:14px;font-weight:800')}>Example report</span>
        <span style={css('font-size:12.5px;color:#FFC14D;font-weight:700')}>Illustration, not real data</span>
      </div>
      <div style={css('margin-top:14px;display:flex;flex-direction:column')}>
        <ExampleRow tag="BUG" title="A confirmed bug, with a failing test" refs="3 of 3 replays reproduce it" fg="#FF8A7B" bg="rgba(255,107,91,0.2)" />
        <ExampleRow tag="SETUP" title="A problem with the test environment" refs="Not counted as a bug" fg="#B9A6FF" bg="rgba(139,124,255,0.22)" />
      </div>
    </div>
  );
}

function ExampleRow({ tag, title, refs, fg, bg }: { tag: string; title: string; refs: string; fg: string; bg: string }) {
  return (
    <div style={css('display:flex;gap:12px;align-items:flex-start;padding:13px 0;border-top:1px solid rgba(255,255,255,0.08)')}>
      <span style={css(`flex:0 0 auto;font-size:11.5px;font-weight:800;color:${fg};background:${bg};padding:4px 9px;border-radius:99px;min-width:46px;text-align:center;box-sizing:border-box`)}>{tag}</span>
      <div style={css('min-width:0')}>
        <div style={css('font-size:14.5px;font-weight:700;line-height:1.35')}>{title}</div>
        <div style={css('font-size:12.5px;color:#8E9BB2;margin-top:3px')}>{refs}</div>
      </div>
    </div>
  );
}

function Hero({ accent }: { accent: string }) {
  return (
    <section style={css('position:relative;max-width:1240px;margin:0 auto;box-sizing:border-box;padding:64px 40px 96px;display:flex;flex-wrap:wrap;gap:56px;align-items:center')}>
      <div style={css('flex:1 1 520px;min-width:0')}>
        <div style={css(`display:inline-block;font-size:13px;font-weight:700;color:${accent};background:rgba(52,227,203,0.12);border:1px solid rgba(52,227,203,0.35);padding:7px 16px;border-radius:99px`)}>AI QA that proves what it finds</div>
        <h1 style={css('margin:24px 0 20px;font-size:76px;line-height:0.98;font-weight:800;letter-spacing:-3.2px')}>
          Wake up to <span style={css(`color:${accent}`)}>proven bugs</span> and fixes ready to review.
        </h1>
        <p style={css('margin:0;font-size:20px;line-height:1.55;color:#B4BFD2;max-width:560px')}>NightQA tests your staging app like a real user, proves each bug with a failing test, and triggers the fix pull request through your coding agent. You review and merge.</p>
        <div style={css('margin-top:36px;display:flex;flex-wrap:wrap;gap:12px;align-items:center')}>
          <Link href="/setup" style={css(`min-height:54px;box-sizing:border-box;padding:0 28px;border-radius:14px;background:${accent};color:#03211D;display:inline-flex;align-items:center;font-size:16px;font-weight:800;box-shadow:0 12px 34px -8px rgba(52,227,203,0.75)`)}>Set up NightQA</Link>
          <Link href="/login" style={css('min-height:54px;box-sizing:border-box;padding:0 24px;border-radius:14px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:#EAF0FA;display:inline-flex;align-items:center;font-size:16px;font-weight:700')}>Sign in</Link>
        </div>
        <div style={css('font-size:12.5px;color:#8E9BB2;margin-top:12px')}>Staging sites only. NightQA never touches production.</div>
      </div>
      <div style={css('flex:1 1 440px;min-width:0;position:relative;display:flex;justify-content:center')}>
        <div style={css(`position:absolute;right:-40px;top:-60px;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle at 34% 32%,#E9FFFB 0%,${accent} 38%,#0C6F63 78%,#07312D 100%);box-shadow:0 0 140px 40px rgba(52,227,203,0.3),inset -36px -24px 70px rgba(0,0,0,0.4)`)} />
        <ExampleCard />
      </div>
    </section>
  );
}

function HowItWorks({ accent }: { accent: string }) {
  const colors = [...STAGE_COLORS, accent];
  return (
    <section id="how" style={css('max-width:1240px;margin:0 auto;box-sizing:border-box;padding:32px 40px 96px')}>
      <div style={css(`font-size:12.5px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:${accent}`)}>How it works</div>
      <h2 style={css('margin:10px 0 14px;font-size:48px;line-height:1.05;font-weight:800;letter-spacing:-1.8px;max-width:700px')}>From suspected bug to merged fix</h2>
      <p style={css('margin:0 0 40px;font-size:17px;color:#A3AEC2;max-width:620px;line-height:1.55')}>Every bug goes through the same four stages. A human decides at the end.</p>
      <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px')}>
        {STAGES.map((s, i) => {
          const color = colors[i] ?? accent;
          return (
            <div key={s.n} style={css(stageCard(color))}>
              <div style={css(stageNum(color))}>{s.n}</div>
              <div style={css('font-size:24px;font-weight:800;margin-top:22px;letter-spacing:-0.6px')}>{s.title}</div>
              <div style={css('font-size:14.5px;color:#B4BFD2;margin-top:10px;line-height:1.6')}>{s.text}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Trust() {
  return (
    <>
      <section id="trust" style={css(WRAP)}>
        <h2 style={css(H2)}>Built so you can trust the report</h2>
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px')}>
          {TRUST.map((t) => (
            <div key={t.title} style={css('padding:30px;border-radius:26px;border:1px solid rgba(255,255,255,0.09);background:linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015));box-shadow:inset 0 1px 0 rgba(255,255,255,0.08)')}>
              <div style={css('font-size:22px;font-weight:800;letter-spacing:-0.5px;line-height:1.25')}>{t.title}</div>
              <div style={css('font-size:15px;color:#B4BFD2;margin-top:12px;line-height:1.6')}>{t.text}</div>
            </div>
          ))}
        </div>
      </section>
      <section style={css(WRAP)}>
        <div style={css('padding:44px 48px;border-radius:32px;border:1px solid rgba(255,255,255,0.1);background:linear-gradient(180deg,rgba(139,124,255,0.14),rgba(52,227,203,0.05));box-shadow:0 0 90px -30px rgba(139,124,255,0.6),inset 0 1px 0 rgba(255,255,255,0.1)')}>
          <h2 style={css('margin:0 0 10px;font-size:38px;font-weight:800;letter-spacing:-1.3px')}>Careful by design</h2>
          <p style={css('margin:0 0 26px;font-size:16.5px;color:#C7D0E0;line-height:1.55;max-width:640px')}>NightQA only reports what it can prove, and only touches the staging app you point it at.</p>
          <div style={css('display:flex;flex-wrap:wrap;gap:10px')}>
            {GUARANTEES.map((label) => (
              <span key={label} style={css('font-size:14.5px;font-weight:600;padding:11px 18px;border-radius:99px;border:1px solid rgba(255,255,255,0.16);background:rgba(7,10,16,0.5)')}>{label}</span>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function FinalCta({ accent }: { accent: string }) {
  return (
    <section style={css(WRAP)}>
      <div style={css(`position:relative;overflow:hidden;padding:56px;border-radius:34px;background:${accent};color:#03211D;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px;box-shadow:0 30px 90px -20px rgba(52,227,203,0.6)`)}>
        <div style={css('position:absolute;right:-80px;top:-120px;width:320px;height:320px;border-radius:50%;background:rgba(3,33,29,0.12)')} />
        <div style={css('position:relative;max-width:620px')}>
          <div style={css('font-size:40px;font-weight:800;letter-spacing:-1.4px;line-height:1.1')}>Point it at your staging app.</div>
          <div style={css('font-size:17px;margin-top:10px;line-height:1.5')}>Connect GitHub, add a staging URL and one test account. NightQA takes it from there.</div>
        </div>
        <Link href="/setup" style={css('position:relative;min-height:56px;box-sizing:border-box;padding:0 32px;border-radius:16px;background:#03211D;color:#EAF0FA;display:inline-flex;align-items:center;font-size:16px;font-weight:800')}>Get started</Link>
      </div>
    </section>
  );
}

export default function Landing({ accent = DEFAULT_ACCENT }: LandingProps) {
  return (
    <div style={css("font-family:'Manrope',system-ui,sans-serif;color:#EAF0FA;background:#070A10;overflow:hidden")}>
      <div style={css('position:relative;background:radial-gradient(1100px 640px at 80% -80px,rgba(52,227,203,0.22),transparent 62%),radial-gradient(900px 600px at 0% 20%,rgba(139,124,255,0.16),transparent 62%)')}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.85, backgroundImage: STARS }} />
        <Header accent={accent} />
        <Hero accent={accent} />
      </div>
      <HowItWorks accent={accent} />
      <Trust />
      <FinalCta accent={accent} />
      <footer style={css('border-top:1px solid rgba(255,255,255,0.08)')}>
        <div style={css('max-width:1240px;margin:0 auto;box-sizing:border-box;padding:28px 40px 40px;font-size:13.5px;color:#8E9BB2')}>NightQA · AI QA for AI-written software</div>
      </footer>
    </div>
  );
}
