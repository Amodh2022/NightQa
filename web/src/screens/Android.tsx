// Hand-maintained (not generated). V2 Android preview, from design/source/Android.dc.html.
// Android runs do not exist yet: everything here is a labelled illustration or a plan, never a result.
import { css } from '@/lib/dc';

const DEFAULT_ACCENT = '#34E3CB';

export interface AndroidProps {
  accent?: string;
  active?: string;
}

interface PlannedCard {
  title: string;
  text: string;
  tone: string;
}

const PLANNED: readonly PlannedCard[] = [
  { title: 'OTP helper', text: 'A test OTP on staging, or a fake SMS on the emulator, so login flows never get stuck.', tone: '#6AA6FF' },
  { title: 'Payment sandbox', text: 'UPI and card flows run in the payment provider’s test mode. Never real money.', tone: '' },
  { title: 'Indian-language checks', text: 'Hindi, Kannada and Tamil input, plus translated text that overflows or breaks layouts.', tone: '#FF6B5B' },
  { title: 'Crash signals', text: 'App crashes and “app not responding” from device logs become bugs with evidence.', tone: '#8B7CFF' },
];

const EXPECTED_REQUIREMENTS: readonly string[] = [
  'The staging build must allow emulators. Many banking and fintech apps block them.',
  'Payment apps are not on emulators, so payments must use a sandbox.',
  'Flutter apps need accessibility labels, or the agent relies on screenshots and is less reliable.',
  'For a fix PR to prove itself, your CI must run the Maestro test on an emulator.',
];

const CARD_BASE =
  'padding:22px 22px 20px;border-radius:22px;border:1px solid rgba(255,255,255,0.09);background:linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.016));box-shadow:inset 0 1px 0 rgba(255,255,255,0.07)';
const CARD_HOT =
  'padding:22px 22px 20px;border-radius:22px;border:1px solid rgba(255,107,91,0.5);background:linear-gradient(180deg,rgba(255,107,91,0.12),rgba(255,107,91,0.03));box-shadow:0 0 44px -16px rgba(255,107,91,0.6),inset 0 1px 0 rgba(255,255,255,0.07)';
const PILL = 'font-size:11px;font-weight:800;color:#FFC14D;background:rgba(255,193,77,0.16);padding:3px 9px;border-radius:99px';

function PhoneIllustration({ accent }: { accent: string }) {
  return (
    <section style={css('flex:0 0 360px;display:flex;flex-direction:column;align-items:center;gap:16px')}>
      <div aria-hidden="true" style={css(`width:320px;height:640px;box-sizing:border-box;border-radius:44px;border:2px solid rgba(255,255,255,0.28);padding:12px;background:#0B1019;box-shadow:0 0 90px -20px ${accent}8c,0 40px 80px -30px rgba(0,0,0,0.9)`)}>
        <div style={css('width:100%;height:100%;border-radius:34px;overflow:hidden;background:#F7F8FA;color:#1B2330;display:flex;flex-direction:column')}>
          <div style={css('padding:22px 20px 12px;font-size:20px;font-weight:800')}>Checkout</div>
          <div style={css('padding:0 20px;display:flex;flex-direction:column;gap:12px;flex:1')}>
            <div style={css('display:flex;justify-content:space-between;font-size:14px')}><span>Item</span><span>Price</span></div>
            <div style={css('font-size:13px;color:#5B6577')}>Pay with</div>
            <div style={css('padding:14px 16px;border-radius:14px;border:2px solid #1AA394;background:#E8F7F5;font-size:14.5px;font-weight:700;display:flex;justify-content:space-between')}><span>Sandbox option</span><span style={css('color:#1AA394')}>test</span></div>
            <div style={css('padding:14px 16px;border-radius:14px;border:1px solid #D5DAE3;font-size:14.5px')}>Another option</div>
          </div>
          <div style={css('padding:16px 20px 22px')}><div style={css('min-height:52px;border-radius:14px;background:#1B2330;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700')}>Pay</div></div>
        </div>
      </div>
      <div style={css('display:flex;gap:10px;align-items:center;font-size:13px;color:#A3AEC2')}>
        <span style={css('width:10px;height:10px;border-radius:50%;background:#FFC14D')} />
        Illustration only. Not a real run or a real device.
      </div>
    </section>
  );
}

export default function Android({ accent = DEFAULT_ACCENT }: AndroidProps) {
  return (
    <div style={css("width:1440px;box-sizing:border-box;padding:52px 64px;font-family:'Manrope',system-ui,sans-serif;color:#EAF0FA;background:radial-gradient(900px 520px at 20% -100px,rgba(52,227,203,0.16),transparent 62%),radial-gradient(800px 520px at 96% 90%,rgba(139,124,255,0.15),transparent 62%),#070A10;display:flex;flex-direction:column;gap:28px")}>
      <header style={css('display:flex;justify-content:space-between;align-items:flex-end;gap:20px')}>
        <div>
          <div style={css('display:flex;gap:10px;align-items:center')}>
            <span style={css(`font-size:12.5px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:${accent}`)}>Android and India pack</span>
            <span style={css('font-size:11.5px;font-weight:800;color:#FFC14D;background:rgba(255,193,77,0.16);padding:4px 11px;border-radius:99px')}>V2 preview</span>
          </div>
          <h1 style={css('margin:8px 0 0;font-size:42px;font-weight:800;letter-spacing:-1.6px')}>The same loop, on a phone</h1>
        </div>
        <div style={css('font-size:14px;color:#A3AEC2;max-width:440px;line-height:1.5;text-align:right')}>The plan is the same verdicts, evidence and GitHub issues as web, with a different driver.</div>
      </header>

      <div role="status" style={css('padding:16px 20px;border-radius:16px;border:1px solid rgba(255,193,77,0.45);background:rgba(255,193,77,0.1);font-size:14.5px;line-height:1.5;color:#FFE2A8')}>
        <strong style={css('font-weight:800')}>V2 — Android runs are not available yet.</strong> This page is an unreleased preview of what is planned. Nothing on it is a real result, and no devices, runs or counts are shown.
      </div>

      <div style={css('display:flex;gap:40px;align-items:flex-start')}>
        <PhoneIllustration accent={accent} />

        <section style={css('flex:1;display:flex;flex-direction:column;gap:20px;min-width:0')}>
          <div style={css('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px')}>
            {PLANNED.map((c) => (
              <div key={c.title} style={css(c.tone === '#FF6B5B' ? CARD_HOT : CARD_BASE)}>
                <div style={css('display:flex;justify-content:space-between;align-items:center')}>
                  <div style={css('font-size:17px;font-weight:800;letter-spacing:-0.3px')}>{c.title}</div>
                  <span style={css(PILL)}>Planned</span>
                </div>
                <div style={css('font-size:13px;color:#A3AEC2;margin-top:8px;line-height:1.5')}>{c.text}</div>
              </div>
            ))}
          </div>

          <div style={css('padding:22px 24px;border-radius:22px;border:1px solid rgba(255,255,255,0.09);background:rgba(255,255,255,0.03)')}>
            <div style={css('font-size:15px;font-weight:800;margin-bottom:10px')}>Expected requirements for teams</div>
            {EXPECTED_REQUIREMENTS.map((text) => (
              <div key={text} style={css('display:flex;gap:12px;padding:7px 0;font-size:13.5px;color:#C7D0E0;line-height:1.45')}>
                <span style={css('flex:0 0 8px;width:8px;height:8px;border-radius:50%;background:#FFC14D;margin-top:6px')} />
                {text}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
