import { connection } from 'next/server';
import Link from 'next/link';
import { CloseReasons, CopyComment } from '@/components/BugActions';
import { currentViewer } from '@/lib/auth/server';
import { SEVERITY, canAskForFix, closeReasonLabel, fileUrl, fixComment, safeHref, splitEvidence } from '@/lib/bug-view';
import { columnOf, getBug, latestPerBug, listBugs, type BugRecord } from '@/lib/bugs';
import { css } from '@/lib/dc';
import { COLORS } from '@/lib/format';

const ACCENT = COLORS.accent;
const FRAME = `width: 390px; min-height: 844px; box-sizing: border-box; display: flex; flex-direction: column; font-family: 'Manrope', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(420px 320px at 10% -60px, rgba(255,107,91,0.18), transparent 65%), radial-gradient(400px 320px at 100% 50%, rgba(52,227,203,0.14), transparent 65%), #070A10`;
const MONO = "'JetBrains Mono', monospace";

/** Asked-for bug, else the newest fix PR waiting for review, else the newest bug. */
async function pick(run?: string, id?: string): Promise<BugRecord | undefined> {
  if (run && id) return getBug(run, id);
  const bugs = latestPerBug(await listBugs());
  return bugs.find((b) => columnOf(b) === 'fix_pr') ?? bugs[0];
}

export default async function MBugScreen({ run, id }: { run?: string | undefined; id?: string | undefined }) {
  await connection();
  const [bug, viewer] = await Promise.all([pick(run, id), currentViewer()]);

  const back = (
    <header style={css('display: flex; align-items: center; justify-content: space-between; padding: 16px 12px 0 8px')}>
      <Link href="/m/bugs" aria-label="Back to bugs" style={css('width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 24px')}>‹</Link>
      {bug ? (
        <span style={css(`font-family: ${MONO}; font-size: 12.5px; color: #A3AEC2; padding-right: 8px`)}>
          {[bug.issue ? `Issue #${String(bug.issue.number)}` : '', bug.pull ? `PR #${String(bug.pull.number)}` : ''].filter(Boolean).join(' · ') || bug.id}
        </span>
      ) : null}
    </header>
  );

  if (!bug) {
    return (
      <div style={css(FRAME)}>
        {back}
        <main style={css('flex: 1; padding: 20px; font-size: 14.5px; color: #A3AEC2; line-height: 1.5')}>
          {run && id ? 'That bug record was not found.' : 'No bugs yet. A proven bug and its fix PR appear here for review.'}
        </main>
      </div>
    );
  }

  const sev = SEVERITY[bug.severity];
  const ev = splitEvidence(bug.evidence);
  const shot = ev.images[ev.images.length - 1];
  const isMember = viewer?.role === 'member';
  const pullHref = bug.pull ? safeHref(bug.pull.url) : undefined;
  const issueHref = bug.issue ? safeHref(bug.issue.url) : undefined;
  const proven = bug.attempts > 0 && bug.reproduced === bug.attempts;
  const checks: [string, string, boolean][] = [
    ['Reproduced', `${String(bug.reproduced)} of ${String(bug.attempts)}`, proven],
    ['Failing test ran and failed', bug.test ? (bug.test.proven ? 'Yes' : 'No') : 'No test', bug.test?.proven === true],
    ['Fix pull request', bug.pull ? bug.pull.state : 'None yet', bug.pull?.state === 'merged'],
  ];
  const cta = bug.pull?.state === 'open' && pullHref ? { href: pullHref, label: 'Review and merge on GitHub' } : issueHref ? { href: issueHref, label: 'Open the issue on GitHub' } : undefined;

  return (
    <div style={css(FRAME)}>
      {back}
      <main style={css('flex: 1; min-height: 0; padding: 4px 20px 0; display: flex; flex-direction: column; gap: 14px')}>
        <div>
          <div style={css('display: flex; gap: 8px; flex-wrap: wrap')}>
            <span style={css(`font-size: 12px; font-weight: 800; color: ${sev.fg}; background: ${sev.bg}; padding: 4px 11px; border-radius: 99px; box-shadow: 0 0 20px -4px rgba(${sev.rgb},0.6)`)}>{sev.label}</span>
            <span style={css(`font-size: 12px; font-weight: 800; color: ${proven ? ACCENT : '#B9A6FF'}; background: ${proven ? 'rgba(52,227,203,0.13)' : 'rgba(139,124,255,0.2)'}; padding: 4px 11px; border-radius: 99px`)}>
              {proven ? 'Confirmed' : 'Reproduced'} {bug.reproduced} of {bug.attempts}
            </span>
            {bug.closeReason ? <span style={css('font-size: 12px; font-weight: 800; color: #B4BFD2; background: rgba(142,155,178,0.2); padding: 4px 11px; border-radius: 99px')}>Closed: {closeReasonLabel(bug.closeReason)}</span> : null}
          </div>
          <h1 style={css('margin: 10px 0 0; font-size: 26px; line-height: 1.12; font-weight: 800; letter-spacing: -0.9px; overflow-wrap: anywhere')}>{bug.title}</h1>
        </div>

        <section aria-label="Evidence" style={css('padding: 14px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.1); background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.016)); box-shadow: 0 0 50px -20px rgba(255,107,91,0.5), inset 0 1px 0 rgba(255,255,255,0.08)')}>
          {shot ? (
            <a href={fileUrl(bug.runId, shot)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(bug.runId, shot)} alt="Screenshot of the bug" style={css('display: block; width: 100%; border-radius: 12px; background: #05080D')} />
            </a>
          ) : (
            <div style={css('font-size: 13px; color: #A3AEC2')}>No screenshot was saved for this bug.</div>
          )}
          <div style={css('display: flex; gap: 12px; margin-top: 12px')}>
            <div style={css('flex: 1; min-width: 0')}>
              <div style={css('font-size: 11.5px; color: #8E9BB2; font-weight: 700')}>Expected</div>
              <div style={css('font-size: 13px; margin-top: 2px; font-weight: 600; overflow-wrap: anywhere')}>{bug.expected}</div>
            </div>
            <div style={css('flex: 1; min-width: 0')}>
              <div style={css('font-size: 11.5px; color: #FF8A7B; font-weight: 700')}>Actual</div>
              <div style={css('font-size: 13px; margin-top: 2px; font-weight: 600; overflow-wrap: anywhere')}>{bug.actual}</div>
            </div>
          </div>
        </section>

        <section aria-label="Fix status" style={css('padding: 16px 18px 8px; border-radius: 22px; border: 1px solid rgba(52,227,203,0.5); background: linear-gradient(180deg, rgba(52,227,203,0.11), rgba(52,227,203,0.02)); box-shadow: 0 0 50px -18px rgba(52,227,203,0.6), inset 0 1px 0 rgba(255,255,255,0.08)')}>
          <div style={css('font-size: 16px; font-weight: 800')}>Fix status</div>
          <div style={css('display: flex; flex-direction: column; margin-top: 8px')}>
            {checks.map(([label, value, ok]) => (
              <div key={label} style={css('display: flex; gap: 10px; align-items: center; min-height: 40px; border-top: 1px solid rgba(255,255,255,0.08)')}>
                <span style={css(`flex: 0 0 20px; height: 20px; border-radius: 50%; background: ${ok ? 'rgba(52,227,203,0.18)' : 'rgba(255,255,255,0.06)'}; color: ${ok ? ACCENT : '#6F7C94'}; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800`)}>{ok ? '✓' : '–'}</span>
                <span style={css('flex: 1; font-size: 13.5px; font-weight: 600')}>{label}</span>
                <span style={css(`font-size: 12px; color: #A3AEC2; font-family: ${MONO}`)}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        {isMember && canAskForFix(bug) ? (
          <section aria-label="Ask for a fix" style={css('padding: 16px 18px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03)')}>
            <div style={css('font-size: 15px; font-weight: 800')}>Ask for a fix</div>
            <div style={css('font-size: 12.5px; color: #A3AEC2; margin: 4px 0 10px; line-height: 1.5')}>No fix was requested. Paste this on issue #{bug.issue?.number}; NightQA owns the GitHub writes.</div>
            <CopyComment text={fixComment(bug)} />
          </section>
        ) : null}
      </main>

      <footer style={css('padding: 12px 20px 26px; display: flex; flex-direction: column; gap: 10px; background: linear-gradient(180deg, rgba(7,10,16,0), #070A10 40%)')}>
        {cta ? (
          <a href={cta.href} target="_blank" rel="noreferrer noopener" style={css(`display: flex; align-items: center; justify-content: center; min-height: 54px; border-radius: 17px; background: ${ACCENT}; color: #03211D; font-size: 16px; font-weight: 800; box-shadow: 0 14px 40px -8px rgba(52,227,203,0.8)`)}>
            {cta.label}
          </a>
        ) : null}
        {isMember ? <CloseReasons run={bug.runId} id={bug.id} current={bug.closeReason} compact /> : <div style={css('font-size: 12.5px; color: #A3AEC2')}>Your account is view-only.</div>}
      </footer>
    </div>
  );
}
