import { connection } from 'next/server';
import Link from 'next/link';
import { MOBILE_FILTERS, MOBILE_FILTER_LABEL, SEVERITY, filterBugs, fixLine, type MobileFilter } from '@/lib/bug-view';
import { latestPerBug, listBugs, type BugRecord } from '@/lib/bugs';
import { css } from '@/lib/dc';
import { COLORS } from '@/lib/format';
import TabBar from './TabBar';

const ACCENT = COLORS.accent;
const BASE =
  'display:block;padding:15px 16px;border-radius:18px;border:1px solid rgba(255,255,255,0.09);background:linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.016));box-shadow:inset 0 1px 0 rgba(255,255,255,0.07)';
const HOT =
  'display:block;padding:15px 16px;border-radius:18px;border:1px solid rgba(255,107,91,0.55);background:linear-gradient(180deg,rgba(255,107,91,0.14),rgba(255,107,91,0.03));box-shadow:0 0 40px -14px rgba(255,107,91,0.65),inset 0 1px 0 rgba(255,255,255,0.08)';

const ref = (b: BugRecord): string => [b.issue ? `#${String(b.issue.number)}` : '', b.pull ? `PR #${String(b.pull.number)}` : ''].filter(Boolean).join(' · ') || `${String(b.reproduced)} of ${String(b.attempts)}`;

export default async function MBugsScreen({ filter = 'all' }: { filter?: MobileFilter }) {
  await connection();
  const bugs = latestPerBug(await listBugs());
  const shown = filterBugs(bugs, filter);

  return (
    <div style={css(`width: 390px; min-height: 844px; box-sizing: border-box; display: flex; flex-direction: column; font-family: 'Manrope', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(420px 300px at 10% -60px, rgba(255,107,91,0.16), transparent 65%), radial-gradient(380px 300px at 100% 40%, rgba(52,227,203,0.10), transparent 65%), #070A10`)}>
      <header style={css('padding: 26px 20px 8px')}>
        <div style={css(`font-size: 11.5px; letter-spacing: 1.3px; text-transform: uppercase; font-weight: 800; color: ${ACCENT}`)}>Bugs</div>
        <h1 style={css('margin: 6px 0 0; font-size: 30px; font-weight: 800; letter-spacing: -1.1px')}>Proven bugs</h1>
      </header>

      <nav aria-label="Filter" style={css('display: flex; gap: 8px; padding: 10px 20px 14px; overflow-x: auto')}>
        {MOBILE_FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Link
              key={f}
              href={f === 'all' ? '/m/bugs' : `/m/bugs?f=${f}`}
              style={css(
                `flex: 0 0 auto; display: inline-flex; align-items: center; min-height: 44px; box-sizing: border-box; padding: 0 16px; border-radius: 99px; font-size: 13px; font-weight: 800; border: 1px solid ${on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}; background: ${on ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)'}; color: ${on ? '#FFFFFF' : '#A3AEC2'}`,
              )}
            >
              {MOBILE_FILTER_LABEL[f]} {filterBugs(bugs, f).length}
            </Link>
          );
        })}
      </nav>

      <main style={css('flex: 1; min-height: 0; padding: 0 20px 12px; display: flex; flex-direction: column; gap: 12px')}>
        {shown.length === 0 ? (
          <div style={css(`${BASE}; font-size: 14px; color: #A3AEC2; line-height: 1.5`)}>
            {bugs.length === 0 ? 'No bugs yet. They appear here after NightQA investigates a failed run.' : 'No bugs in this group.'}
          </div>
        ) : null}
        {shown.map((b) => {
          const sev = SEVERITY[b.severity];
          const hot = b.pull?.state === 'open';
          return (
            <Link key={`${b.runId}/${b.id}`} href={`/m/bug?run=${encodeURIComponent(b.runId)}&id=${encodeURIComponent(b.id)}`} style={css(hot ? HOT : BASE)}>
              <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 8px')}>
                <span style={css(`font-size: 11.5px; font-weight: 800; color: ${sev.fg}; background: ${sev.bg}; padding: 4px 10px; border-radius: 99px`)}>{sev.label}</span>
                <span style={css("font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #8E9BB2")}>{ref(b)}</span>
              </div>
              <div style={css('font-size: 15.5px; font-weight: 700; margin-top: 10px; line-height: 1.3; overflow-wrap: anywhere')}>{b.title}</div>
              <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 5px')}>
                Reproduced {b.reproduced}/{b.attempts} · {fixLine(b)}
              </div>
            </Link>
          );
        })}
      </main>

      <TabBar active="Bugs" accent={ACCENT} />
    </div>
  );
}
