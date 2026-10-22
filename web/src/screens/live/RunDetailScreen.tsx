import { connection } from 'next/server';
import Link from 'next/link';
import { basename } from 'node:path';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/AutoRefresh';
import { css } from '@/lib/dc';
import { COLORS, VERDICTS, formatDuration, formatUsd, hostLabel, plural, shortStamp } from '@/lib/format';
import { aiSteps, getRun, readCliLog, readLog, type RunResult, type StepResult } from '@/lib/results';
import { findingLabel } from '@/lib/stats';
import Topbar from '../Topbar';
import { MONO, card, main, pageBg } from './ui';

const ACCENT = COLORS.accent;

export const fileUrl = (id: string, rel: string): string => `/api/runs/${id}/files/${rel.split('/').map(encodeURIComponent).join('/')}`;

/** Screenshots are recorded with absolute paths; the artifact list holds the same files relative to the run folder. */
export function screenshotRel(result: RunResult, step: StepResult): string | undefined {
  if (!step.screenshot) return undefined;
  const name = basename(step.screenshot);
  return result.artifacts.screenshots.find((s) => basename(s) === name);
}

const STATUS_LABEL: Record<StepResult['status'], string> = { passed: 'Passed', failed: 'Failed', unclear: 'Unclear', pending: 'Not run' };
const STATUS_FG: Record<StepResult['status'], string> = { passed: ACCENT, failed: '#FF8A7B', unclear: '#B4BFD2', pending: '#6F7C94' };
const STATUS_BG: Record<StepResult['status'], string> = {
  passed: 'background:rgba(52,227,203,0.16)',
  failed: 'background:rgba(255,107,91,0.22)',
  unclear: 'background:rgba(142,155,178,0.22)',
  pending: 'background:rgba(255,255,255,0.06)',
};

const TOOL_COLOR: Record<string, string> = { expect: '#6AA6FF', stuck: '#FF8A7B', done: ACCENT };

export default async function RunDetailScreen({ id }: { id: string }) {
  await connection();
  const run = await getRun(id);
  if (!run) notFound();
  const [log, cli] = await Promise.all([readLog(id), run.status === 'crashed' ? readCliLog(id) : Promise.resolve('')]);
  const r = run.result;
  const meta = r ? VERDICTS[r.verdict] : undefined;
  const steps = aiSteps(log);
  const isBug = r?.verdict === 'bug';
  const failedFinding = r?.findings.find((f) => f.kind === 'expectation-failed');
  const failedStep = r?.stepResults.find((s) => s.status === 'failed');
  const passed = r?.stepResults.filter((s) => s.status === 'passed').length ?? 0;
  const total = r?.stepResults.length ?? 0;
  const notRun = r?.stepResults.filter((s) => s.status === 'pending').map((s) => s.index + 1) ?? [];
  const glow = isBug ? 'rgba(255,107,91,0.10)' : 'rgba(52,227,203,0.12)';

  return (
    <div style={pageBg(glow)}>
      <Topbar active="Runs" accent={ACCENT} />
      <AutoRefresh active={run.status === 'running'} />
      <main style={main('32px 40px 64px')}>
        <header style={css('display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px')}>
          <div>
            <div style={css('font-size: 13.5px; color: #A3AEC2')}>
              <Link href="/runs">Runs</Link> / {run.flow}
            </div>
            <div style={css('display: flex; align-items: center; gap: 14px; margin-top: 10px; flex-wrap: wrap')}>
              <h1 style={css('margin: 0; font-size: 40px; font-weight: 800; letter-spacing: -1.5px')}>{shortStamp(run.startedAt)}</h1>
              {run.status === 'running' ? (
                <span style={css('font-size: 13px; font-weight: 800; color: #8DB8FF; background: rgba(106,166,255,0.18); padding: 7px 14px; border-radius: 99px')}>Running now</span>
              ) : null}
              {run.status === 'crashed' ? (
                <span style={css('font-size: 13px; font-weight: 800; color: #B4BFD2; background: rgba(142,155,178,0.2); padding: 7px 14px; border-radius: 99px')}>Did not finish</span>
              ) : null}
              {meta ? (
                <span style={css(`font-size: 13px; font-weight: 800; color: ${meta.fg}; background: ${meta.bg}; padding: 7px 14px; border-radius: 99px${isBug ? '; box-shadow: 0 0 24px -4px rgba(255,107,91,0.6)' : ''}`)}>
                  Verdict: {meta.label}
                </span>
              ) : null}
              {run.mode === 'replay' ? (
                <span style={css(`font-size: 13px; font-weight: 800; color: ${ACCENT}; background: rgba(52,227,203,0.13); padding: 7px 14px; border-radius: 99px`)}>Replay · no AI</span>
              ) : null}
              {r?.flaky ? (
                <span style={css('font-size: 13px; font-weight: 800; color: #FFC14D; background: rgba(255,193,77,0.17); padding: 7px 14px; border-radius: 99px')}>Flaky: failed once, passed on retry</span>
              ) : null}
            </div>
          </div>
          <div style={css('display: flex; gap: 10px; flex-wrap: wrap')}>
            {r?.artifacts.trace ? (
              <a
                href={fileUrl(id, r.artifacts.trace)}
                download
                style={css('min-height: 48px; box-sizing: border-box; padding: 0 20px; border-radius: 13px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #EAF0FA; display: inline-flex; align-items: center; font-size: 14.5px; font-weight: 700')}
              >
                Download Playwright trace
              </a>
            ) : null}
            <Link
              href="/runs"
              style={css(`min-height: 48px; box-sizing: border-box; padding: 0 22px; border-radius: 13px; background: ${ACCENT}; color: #03211D; display: inline-flex; align-items: center; font-size: 14.5px; font-weight: 800; box-shadow: 0 10px 36px -8px rgba(52,227,203,0.7)`)}
            >
              Back to runs
            </Link>
          </div>
        </header>

        {run.status === 'running' ? (
          <div style={card('padding: 20px 24px; border-color: rgba(106,166,255,0.5)')}>
            <div style={css('font-size: 16px; font-weight: 800')}>The agent is working on it</div>
            <div style={css('font-size: 14px; color: #A3AEC2; margin-top: 6px')}>
              {plural(steps.length, 'AI step')} so far. This page refreshes by itself; the video, trace and verdict appear when the run ends.
            </div>
          </div>
        ) : null}
        {run.status === 'crashed' ? (
          <div style={card('padding: 20px 24px; border-color: rgba(142,155,178,0.5)')}>
            <div style={css('font-size: 16px; font-weight: 800')}>This run did not finish</div>
            <div style={css('font-size: 14px; color: #A3AEC2; margin-top: 6px; line-height: 1.5')}>
              The process ended before it wrote a result. The usual causes are missing settings in .env (AI key, model) or a flow that needs a test account.
            </div>
            {cli ? <pre style={css(`margin: 14px 0 0; padding: 14px 16px; background: #05080D; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; font-family: ${MONO}; font-size: 12.5px; line-height: 1.6; white-space: pre-wrap; color: #C7D0E0; overflow-x: auto`)}>{cli}</pre> : null}
          </div>
        ) : null}

        {r ? (
          <section aria-label="Facts" style={css('display: flex; flex-wrap: wrap; gap: 10px 14px')}>
            {[
              ['Flow', r.flow],
              ['App', hostLabel(r.url)],
              ['Duration', formatDuration(r.durationSeconds)],
              ['Steps passed', `${String(passed)} of ${String(total)}`],
              ['AI cost', run.mode === 'replay' ? 'No AI' : formatUsd(r.cost.usd)],
              ['Tokens', run.mode === 'replay' ? '0' : `${r.cost.inputTokens.toLocaleString('en-US')} in · ${r.cost.outputTokens.toLocaleString('en-US')} out`],
              ['Model', run.mode === 'replay' ? '—' : r.model || '—'],
            ].map(([k, v]) => (
              <div key={k} style={css('display: flex; align-items: baseline; gap: 10px; padding: 10px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03)')}>
                <span style={css('font-size: 12.5px; color: #8E9BB2')}>{k}</span>
                <span style={css('font-size: 14px; font-weight: 700')}>{v}</span>
              </div>
            ))}
          </section>
        ) : null}

        <div style={css('display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start')}>
          <section style={css('flex: 1.75 1 640px; min-width: 0; display: flex; flex-direction: column; gap: 20px')}>
            <div style={card(`padding: 16px${isBug ? '; box-shadow: 0 0 80px -20px rgba(255,107,91,0.35), inset 0 1px 0 rgba(255,255,255,0.06)' : ''}`)}>
              <div style={css('border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); background: #0B1019')}>
                <div style={css('height: 38px; background: #131A27; display: flex; align-items: center; gap: 7px; padding: 0 14px')}>
                  <span style={css('width: 10px; height: 10px; border-radius: 50%; background: #FF6B5B')} />
                  <span style={css('width: 10px; height: 10px; border-radius: 50%; background: #FFC14D')} />
                  <span style={css('width: 10px; height: 10px; border-radius: 50%; background: #34E3CB')} />
                  <span style={css(`margin-left: 14px; flex: 1; max-width: 420px; font-family: ${MONO}; font-size: 12px; color: #A3AEC2; background: rgba(255,255,255,0.06); padding: 5px 12px; border-radius: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`)}>
                    {r?.finalUrl || r?.url || '…'}
                  </span>
                </div>
                {r?.artifacts.video ? (
                  <video controls preload="metadata" src={fileUrl(id, r.artifacts.video)} style={css('display: block; width: 100%; background: #05080D')} />
                ) : (
                  <div style={css('padding: 60px 24px; text-align: center; color: #A3AEC2; font-size: 14.5px; background: #05080D')}>
                    {run.status === 'running' ? 'Recording… the video appears when the run finishes.' : 'No video was recorded for this run.'}
                  </div>
                )}
              </div>
            </div>

            <div style={card('padding: 22px 22px 20px')}>
              <div style={css('display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; gap: 12px; flex-wrap: wrap')}>
                <div style={css('font-size: 16px; font-weight: 800')}>Film strip</div>
                <div style={css('font-size: 12.5px; color: #8E9BB2')}>
                  {failedStep ? `Step ${String(failedStep.index + 1)} of ${String(total)} failed. ` : ''}
                  {notRun.length > 0 ? `Steps ${notRun.join(', ')} were not run.` : r ? 'Every step was run.' : ''}
                </div>
              </div>
              {r && r.stepResults.length > 0 ? (
                <div style={css(`display: grid; grid-template-columns: repeat(${String(Math.min(9, r.stepResults.length))}, minmax(0, 1fr)); gap: 10px`)}>
                  {r.stepResults.map((s) => {
                    const rel = screenshotRel(r, s);
                    const c = s.status === 'passed' ? ACCENT : s.status === 'failed' ? COLORS.coral : 'rgba(255,255,255,0.2)';
                    const glow = s.status === 'failed' ? '0 0 22px rgba(255,107,91,0.7)' : s.status === 'passed' ? '0 0 12px rgba(52,227,203,0.25)' : 'none';
                    return (
                      <div key={s.index} style={css('display: flex; flex-direction: column; gap: 8px')}>
                        {rel ? (
                          <a href={fileUrl(id, rel)} target="_blank" rel="noreferrer" aria-label={`Open the screenshot of step ${String(s.index + 1)}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={fileUrl(id, rel)} alt={`Step ${String(s.index + 1)}: ${s.text}`} style={css(`display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; border-radius: 10px; border: 2px solid ${c}; box-shadow: ${glow}; box-sizing: border-box`)} />
                          </a>
                        ) : (
                          <div style={css(`height: 58px; border-radius: 10px; box-sizing: border-box; border: 2px solid ${c}; background: rgba(255,255,255,0.03); opacity: 0.7`)} />
                        )}
                        <div style={css(`text-align: center; font-family: ${MONO}; font-size: 12px; font-weight: 500; color: ${STATUS_FG[s.status]}`)}>{s.index + 1}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={css('font-size: 14px; color: #A3AEC2')}>Screenshots appear here as each step is checked.</div>
              )}
              {r ? (
                <div style={css('margin-top: 18px; display: flex; flex-direction: column')}>
                  {r.stepResults.map((s) => (
                    <div key={s.index} style={css('display: flex; gap: 14px; align-items: baseline; padding: 11px 0; border-top: 1px solid rgba(255,255,255,0.07)')}>
                      <span style={css(`flex: 0 0 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; font-family: ${MONO}; ${STATUS_BG[s.status]}; color: ${STATUS_FG[s.status]}`)}>{s.index + 1}</span>
                      <span style={css('flex: 1; min-width: 0')}>
                        <span style={css('display: block; font-size: 14.5px; font-weight: 600')}>{s.text}</span>
                        {s.expect ? <span style={css('display: block; font-size: 12.5px; color: #8E9BB2; margin-top: 3px')}>Expect: {s.expect}</span> : null}
                        {s.evidence ? <span style={css('display: block; font-size: 12.5px; color: #A3AEC2; margin-top: 3px')}>Saw: {s.evidence}</span> : null}
                      </span>
                      <span style={css(`font-size: 12.5px; font-weight: 800; color: ${STATUS_FG[s.status]}`)}>{STATUS_LABEL[s.status]}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <aside style={css('flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 20px')}>
            {r ? (
              <div style={card('padding: 22px')}>
                <div style={css('font-size: 16px; font-weight: 800; margin-bottom: 16px')}>What happened</div>
                {failedFinding && failedStep?.expect ? (
                  <div style={css('display: flex; flex-direction: column; gap: 12px')}>
                    <div style={css('border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 14px 16px')}>
                      <div style={css('font-size: 12px; color: #8E9BB2; font-weight: 700')}>Expected</div>
                      <div style={css('font-size: 15px; margin-top: 5px; font-weight: 600')}>{failedStep.expect}</div>
                    </div>
                    <div style={css('border: 1px solid rgba(255,107,91,0.6); background: rgba(255,107,91,0.09); border-radius: 14px; padding: 14px 16px; box-shadow: 0 0 36px -12px rgba(255,107,91,0.7)')}>
                      <div style={css('font-size: 12px; color: #FF8A7B; font-weight: 700')}>Actual</div>
                      <div style={css('font-size: 15px; margin-top: 5px; font-weight: 600')}>{failedFinding.message.replace(/^.*? but /, '')}</div>
                    </div>
                  </div>
                ) : (
                  <div style={css(`border: 1px solid ${meta?.color ?? '#8E9BB2'}66; border-radius: 14px; padding: 14px 16px`)}>
                    <div style={css(`font-size: 12px; color: ${meta?.fg ?? '#A3AEC2'}; font-weight: 700`)}>{meta?.label ?? 'Result'}</div>
                    <div style={css('font-size: 15px; margin-top: 5px; font-weight: 600; line-height: 1.45')}>{r.reason}</div>
                  </div>
                )}
                <div style={css('margin-top: 18px; font-size: 12.5px; color: #8E9BB2; font-weight: 700')}>Findings</div>
                <div style={css(`margin-top: 8px; background: #05080D; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px 16px; font-family: ${MONO}; font-size: 12.5px; line-height: 1.8; overflow-x: auto`)}>
                  {r.findings.length === 0 ? <div style={css('color: #A3AEC2')}>No errors, failed requests or broken pages were seen.</div> : null}
                  {r.findings.map((f, i) => (
                    <div key={`${f.kind}-${String(i)}`} style={css('margin-bottom: 8px; white-space: pre-wrap; word-break: break-word')}>
                      <span style={css(`color: ${COLORS.coral}`)}>{findingLabel(f.kind)}</span> <span style={css('color: #A3AEC2')}>step {f.stepIndex + 1}</span>
                      <div style={css('color: #C7D0E0')}>{f.message}</div>
                    </div>
                  ))}
                </div>
                <div style={css('margin-top: 16px; font-size: 12.5px; color: #8E9BB2; line-height: 1.7')}>
                  {r.artifacts.trace ? (
                    <>
                      Open the trace: <code style={css(`font-family: ${MONO}; color: #C7D0E0`)}>npx playwright show-trace results/{id}/{r.artifacts.trace}</code>
                      <br />
                    </>
                  ) : null}
                  <a href={fileUrl(id, 'run.jsonl')} target="_blank" rel="noreferrer" style={css(`color: ${ACCENT}; font-weight: 700`)}>Run log</a>
                  {' · '}
                  <a href={fileUrl(id, 'result.json')} target="_blank" rel="noreferrer" style={css(`color: ${ACCENT}; font-weight: 700`)}>result.json</a>
                </div>
              </div>
            ) : null}

            {run.mode === 'ai' ? (
              <div style={card('padding: 22px')}>
                <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 10px')}>
                  <div style={css('font-size: 16px; font-weight: 800')}>Agent reasoning</div>
                  {r?.model ? <span style={css('font-size: 11.5px; font-weight: 800; color: #B9A6FF; background: rgba(139,124,255,0.18); padding: 4px 10px; border-radius: 99px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap')}>{r.model}</span> : null}
                </div>
                <div style={css('margin-top: 16px; display: flex; flex-direction: column; gap: 14px')}>
                  {steps.length === 0 ? <div style={css('font-size: 13.5px; color: #A3AEC2')}>No AI calls were logged for this run yet.</div> : null}
                  {steps.slice(-14).map((s) => {
                    const c = TOOL_COLOR[s.tool ?? ''] ?? ACCENT;
                    return (
                      <div key={s.step} style={css('display: flex; gap: 14px; align-items: flex-start')}>
                        <span style={css(`flex: 0 0 74px; text-align: center; font-family: ${MONO}; font-size: 11px; font-weight: 500; padding: 5px 0; border-radius: 8px; color: ${c}; background: ${c}22`)}>{(s.tool ?? 'none').toUpperCase()}</span>
                        <span style={css('font-size: 13.5px; color: #C7D0E0; line-height: 1.55; padding-top: 3px')}>
                          {s.reasoning || '(the model gave no reasoning text)'}
                          <span style={css(`display: block; font-family: ${MONO}; font-size: 11px; color: #6F7C94; margin-top: 3px`)}>
                            step {s.step} · {s.inputTokens.toLocaleString('en-US')} in / {s.outputTokens.toLocaleString('en-US')} out
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                {steps.length > 14 ? <div style={css('margin-top: 14px; font-size: 12.5px; color: #8E9BB2')}>Showing the last 14 of {steps.length} AI steps. The full list is in the run log.</div> : null}
              </div>
            ) : (
              <div style={card('padding: 22px')}>
                <div style={css('font-size: 16px; font-weight: 800; margin-bottom: 10px')}>Replay, no AI</div>
                <div style={css('font-size: 13.5px; color: #A3AEC2; line-height: 1.6')}>
                  This run replayed a saved test. It made 0 AI calls and cost {formatUsd(0)}.
                  {r?.attempts && r.attempts > 1 ? ` It ran ${String(r.attempts)} times: a failed replay is retried once in a fresh browser to rule out a random glitch.` : ''}
                </div>
              </div>
            )}

            {isBug ? (
              <div style={card('padding: 22px')}>
                <div style={css('font-size: 16px; font-weight: 800; margin-bottom: 10px')}>Reproducer</div>
                <div style={css('font-size: 13.5px; color: #A3AEC2; line-height: 1.6')}>
                  Not run yet. This is a bug candidate from a single run. The reproducer (replay it 3 times, shorten the recipe, write a failing test) comes next, and only then does a bug go to GitHub.
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}
