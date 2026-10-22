import { connection } from 'next/server';
import { basename } from 'node:path';
import { AutoRefresh } from '@/components/AutoRefresh';
import { fileUrl, stepWindow } from '@/lib/bug-view';
import { css } from '@/lib/dc';
import { COLORS, VERDICTS, formatDuration, hostLabel, shortStamp } from '@/lib/format';
import { getRun, listRuns, type RunResult, type StepResult } from '@/lib/results';
import TabBar from './TabBar';

const ACCENT = COLORS.accent;
const MONO = "'JetBrains Mono', monospace";
const FRAME = `width: 390px; min-height: 844px; box-sizing: border-box; display: flex; flex-direction: column; font-family: 'Manrope', system-ui, sans-serif; color: #EAF0FA; background: radial-gradient(420px 320px at 90% -60px, rgba(255,107,91,0.16), transparent 65%), radial-gradient(400px 300px at 0% 60%, rgba(52,227,203,0.10), transparent 65%), #070A10`;

const STATUS: Record<StepResult['status'], { label: string; fg: string; bg: string }> = {
  passed: { label: 'Passed', fg: ACCENT, bg: 'rgba(52,227,203,0.16)' },
  failed: { label: 'Failed', fg: '#FF8A7B', bg: 'rgba(255,107,91,0.22)' },
  unclear: { label: 'Unclear', fg: '#B4BFD2', bg: 'rgba(142,155,178,0.22)' },
  pending: { label: 'Not run', fg: '#6F7C94', bg: 'rgba(255,255,255,0.06)' },
};

function frameStyle(s: StepResult['status']): string {
  const base = 'height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; box-sizing: border-box;';
  if (s === 'passed') return `${base} border: 1.5px solid ${ACCENT}; color: ${ACCENT}; background: rgba(52,227,203,0.08)`;
  if (s === 'failed') return `${base} border: 1.5px solid ${COLORS.coral}; color: #FF8A7B; background: rgba(255,107,91,0.15); box-shadow: 0 0 16px rgba(255,107,91,0.7)`;
  return `${base} border: 1.5px dashed rgba(255,255,255,0.2); color: #6F7C94`;
}

/** Screenshots are recorded with absolute paths; the run's artifact list holds the same files relative to the run folder. */
function shotFor(result: RunResult, step: StepResult | undefined): string | undefined {
  if (!step?.screenshot) return undefined;
  const name = basename(step.screenshot);
  return result.artifacts.screenshots.find((s) => basename(s) === name);
}

export default async function MRunScreen({ id }: { id?: string | undefined }) {
  await connection();
  const run = id ? await getRun(id) : (await listRuns())[0];
  const r = run?.result;

  if (!run) {
    return (
      <div style={css(FRAME)}>
        <main style={css('flex: 1; padding: 26px 20px; display: flex; flex-direction: column; gap: 8px')}>
          <h1 style={css('margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -1px')}>No runs yet</h1>
          <div style={css('font-size: 14.5px; color: #A3AEC2; line-height: 1.5')}>{id ? 'That run was not found.' : 'Start a run from the dashboard and its replay appears here.'}</div>
        </main>
        <TabBar active="Runs" accent={ACCENT} />
      </div>
    );
  }

  const meta = r ? VERDICTS[r.verdict] : undefined;
  const steps = r?.stepResults ?? [];
  const failedStep = steps.find((s) => s.status === 'failed');
  const shot = r ? shotFor(r, failedStep ?? steps.find((s) => s.screenshot)) : undefined;
  const video = r?.artifacts.video;
  const isBug = r?.verdict === 'bug';

  return (
    <div style={css(FRAME)}>
      <AutoRefresh active={run.status === 'running'} />
      <header style={css('padding: 26px 20px 6px')}>
        <div style={css(`font-size: 11.5px; letter-spacing: 1.3px; text-transform: uppercase; font-weight: 800; color: ${ACCENT}`)}>Run · {shortStamp(run.startedAt)}</div>
        <h1 style={css('margin: 6px 0 0; font-size: 28px; font-weight: 800; letter-spacing: -1px; overflow-wrap: anywhere')}>{run.flow}</h1>
        <div style={css('display: flex; gap: 8px; margin-top: 10px; align-items: center; flex-wrap: wrap')}>
          {meta ? (
            <span style={css(`font-size: 12px; font-weight: 800; color: ${meta.fg}; background: ${meta.bg}; padding: 4px 11px; border-radius: 99px${isBug ? '; box-shadow: 0 0 20px -4px rgba(255,107,91,0.6)' : ''}`)}>Verdict: {meta.label}</span>
          ) : (
            <span style={css('font-size: 12px; font-weight: 800; color: #8DB8FF; background: rgba(106,166,255,0.18); padding: 4px 11px; border-radius: 99px')}>{run.status === 'running' ? 'Running now' : 'Did not finish'}</span>
          )}
          {r ? <span style={css('font-size: 12.5px; color: #A3AEC2')}>{hostLabel(r.url)} · {formatDuration(r.durationSeconds)}</span> : null}
        </div>
      </header>

      <main style={css('flex: 1; min-height: 0; padding: 14px 20px 12px; display: flex; flex-direction: column; gap: 16px')}>
        <section aria-label="Replay" style={css('padding: 12px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.1); background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.016)); box-shadow: 0 0 60px -20px rgba(255,107,91,0.5), inset 0 1px 0 rgba(255,255,255,0.08)')}>
          {video ? (
            <video controls playsInline preload="metadata" src={fileUrl(run.id, video)} style={css('display: block; width: 100%; border-radius: 14px; background: #05080D')} />
          ) : shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(run.id, shot)} alt="Screenshot of the step that failed" style={css('display: block; width: 100%; border-radius: 14px; background: #05080D')} />
          ) : (
            <div style={css('padding: 36px 16px; text-align: center; font-size: 13.5px; color: #A3AEC2; background: #05080D; border-radius: 14px')}>
              {run.status === 'running' ? 'Recording… the video appears when the run ends.' : 'No video or screenshot was saved for this run.'}
            </div>
          )}
          {steps.length > 0 ? (
            <div style={css(`display: grid; grid-template-columns: repeat(${String(Math.min(9, steps.length))}, minmax(0, 1fr)); gap: 5px; margin-top: 14px; font-family: ${MONO}`)}>
              {steps.map((s) => (
                <div key={s.index} style={css(frameStyle(s.status))} title={STATUS[s.status].label}>{s.index + 1}</div>
              ))}
            </div>
          ) : null}
        </section>

        <section aria-label="Steps" style={css('display: flex; flex-direction: column')}>
          <div style={css('font-size: 15px; font-weight: 800; margin-bottom: 4px')}>{failedStep ? 'Where it broke' : 'Steps'}</div>
          {steps.length === 0 ? <div style={css('font-size: 13.5px; color: #A3AEC2; padding: 10px 0')}>Steps appear here as each one is checked.</div> : null}
          {stepWindow(steps).map((s) => {
            const st = STATUS[s.status];
            return (
              <div key={s.index} style={css('display: flex; gap: 12px; align-items: center; min-height: 46px; padding: 6px 0; box-sizing: border-box; border-top: 1px solid rgba(255,255,255,0.08)')}>
                <span style={css(`flex: 0 0 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 800; font-family: ${MONO}; background: ${st.bg}; color: ${st.fg}`)}>{s.index + 1}</span>
                <span style={css('flex: 1; font-size: 13.5px; line-height: 1.35; font-weight: 600; overflow-wrap: anywhere')}>{s.text}</span>
                <span style={css(`font-size: 12px; font-weight: 800; flex: 0 0 auto; color: ${st.fg}`)}>{st.label}</span>
              </div>
            );
          })}
        </section>
      </main>

      <TabBar active="Runs" accent={ACCENT} />
    </div>
  );
}
