import { connection } from 'next/server';
import Link from 'next/link';
import { CloseReasons, CopyComment } from '@/components/BugActions';
import { currentViewer } from '@/lib/auth/server';
import { readBugSpec } from '@/lib/bug-files';
import { SEVERITY, buildStory, canAskForFix, closeReasonLabel, fileUrl, fixComment, highlight, percent, safeHref, splitEvidence, type StoryItem } from '@/lib/bug-view';
import { getBug, latestPerBug, listBugs, mergedFixRate, type BugRecord } from '@/lib/bugs';
import { css } from '@/lib/dc';
import { COLORS, shortStamp } from '@/lib/format';
import Topbar from './Topbar';
import { MONO, card, emptyCard, pageBg } from './live/ui';

const ACCENT = COLORS.accent;
const TONE: Record<StoryItem['tone'], string> = { coral: COLORS.coral, accent: ACCENT, blue: COLORS.blue, now: '#FFFFFF' };
const H2 = 'font-size: 18px; font-weight: 800; letter-spacing: -0.4px';

function Link2({ href, children }: { href: string | undefined; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" style={css(`color: ${ACCENT}; font-weight: 800`)}>
      {children}
    </a>
  );
}

async function pick(run?: string, id?: string): Promise<BugRecord | undefined> {
  if (run && id) return getBug(run, id);
  return latestPerBug(await listBugs())[0];
}

export default async function BugScreen({ run, id }: { run?: string | undefined; id?: string | undefined }) {
  await connection();
  const [bug, viewer, all] = await Promise.all([pick(run, id), currentViewer(), listBugs()]);
  if (!bug) {
    return (
      <div style={pageBg('rgba(255,107,91,0.11)')}>
        <Topbar active="Bugs" accent={ACCENT} />
        <main style={css('max-width: 1320px; margin: 0 auto; padding: 48px 40px')}>
          <div style={emptyCard}>
            <div style={css('font-size: 20px; font-weight: 800')}>{run && id ? 'That bug record was not found' : 'No bugs yet'}</div>
            <div style={css('font-size: 14.5px; color: #A3AEC2; max-width: 520px; line-height: 1.5')}>Proven bugs appear on the board after NightQA investigates a failed run.</div>
            <Link href="/bugs" style={css(`font-size: 14px; font-weight: 800; color: ${ACCENT}`)}>Back to bugs</Link>
          </div>
        </main>
      </div>
    );
  }

  const spec = await readBugSpec(bug);
  const ev = splitEvidence(bug.evidence);
  const sev = SEVERITY[bug.severity];
  const isMember = viewer?.role === 'member';
  const story = buildStory(bug, (iso) => shortStamp(new Date(iso)));
  const rate = percent(mergedFixRate(all));
  const proven = bug.reproduced === bug.attempts && bug.attempts > 0;
  const issueHref = bug.issue ? safeHref(bug.issue.url) : undefined;
  const pullHref = bug.pull ? safeHref(bug.pull.url) : undefined;
  const lines = spec ? spec.replace(/\n$/, '').split('\n') : [];

  return (
    <div style={pageBg('rgba(255,107,91,0.11)', 'rgba(52,227,203,0.07)')}>
      <Topbar active="Bugs" accent={ACCENT} />
      <main style={css('max-width: 1320px; margin: 0 auto; box-sizing: border-box; padding: 32px 40px 64px; display: flex; flex-direction: column; gap: 28px')}>
        <header style={css('display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px')}>
          <div style={css('min-width: 0; max-width: 820px')}>
            <div style={css('font-size: 13.5px; color: #A3AEC2')}>
              <Link href="/bugs">Bugs</Link> / {bug.issue ? `#${String(bug.issue.number)}` : bug.id}
            </div>
            <h1 style={css('margin: 12px 0 14px; font-size: 46px; line-height: 1.05; font-weight: 800; letter-spacing: -1.8px; overflow-wrap: anywhere')}>{bug.title}</h1>
            <div style={css('display: flex; gap: 8px; flex-wrap: wrap')}>
              <span style={css(`font-size: 12.5px; font-weight: 800; color: ${sev.fg}; background: ${sev.bg}; padding: 6px 13px; border-radius: 99px; box-shadow: 0 0 24px -4px rgba(${sev.rgb},0.6)`)}>{sev.label} severity</span>
              <span style={css(`font-size: 12.5px; font-weight: 800; color: ${proven ? ACCENT : '#B9A6FF'}; background: ${proven ? 'rgba(52,227,203,0.13)' : 'rgba(139,124,255,0.2)'}; padding: 6px 13px; border-radius: 99px`)}>
                {proven ? 'Confirmed' : 'Reproduced'} {bug.reproduced} of {bug.attempts}
              </span>
              <span style={css('font-size: 12.5px; font-weight: 700; color: #C7D0E0; background: rgba(255,255,255,0.07); padding: 6px 13px; border-radius: 99px')}>{bug.flow}</span>
              {bug.closeReason ? (
                <span style={css('font-size: 12.5px; font-weight: 800; color: #B4BFD2; background: rgba(142,155,178,0.2); padding: 6px 13px; border-radius: 99px')}>Closed: {closeReasonLabel(bug.closeReason)}</span>
              ) : null}
            </div>
          </div>
          <Link href={`/runs/${bug.runId}`} style={css('min-height: 48px; box-sizing: border-box; padding: 0 22px; border-radius: 13px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); display: inline-flex; align-items: center; font-size: 14.5px; font-weight: 700')}>
            Watch the replay
          </Link>
        </header>

        <div style={css('display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start')}>
          <div style={css('flex: 1.5 1 600px; min-width: 0; display: flex; flex-direction: column; gap: 22px')}>
            <section style={card('padding: 28px 30px')}>
              <div style={css(`${H2}; margin-bottom: 20px`)}>How it went from suspect to fix</div>
              <div style={css('display: flex; flex-direction: column')}>
                {story.map((s, i) => {
                  const c = TONE[s.tone];
                  const now = s.tone === 'now';
                  return (
                    <div key={`${s.label}-${String(i)}`} style={css('display: flex; gap: 18px; align-items: stretch')}>
                      <div style={css('display: flex; flex-direction: column; align-items: center; width: 18px; flex: 0 0 18px')}>
                        <span style={css(`width: 18px; height: 18px; border-radius: 50%; box-sizing: border-box; background: ${now ? '#070A10' : c}; ${now ? 'border: 3px solid #FFFFFF; box-shadow: 0 0 0 5px rgba(255,255,255,0.14), 0 0 20px #FFFFFF' : `box-shadow: 0 0 14px ${c}99`}`)} />
                        {i === story.length - 1 ? null : <span style={css(`flex: 1; width: 2px; margin-top: 4px; background: linear-gradient(180deg, ${c}66, rgba(255,255,255,0.1)); min-height: 18px`)} />}
                      </div>
                      <div style={css('padding-bottom: 20px; flex: 1; min-width: 0')}>
                        <div style={css('display: flex; justify-content: space-between; gap: 10px; align-items: baseline')}>
                          <div style={css(`font-size: 15.5px; font-weight: ${now ? 800 : 700}; color: ${now ? '#FFFFFF' : '#EAF0FA'}`)}>{s.label}</div>
                          {s.time ? <div style={css(`font-family: ${MONO}; font-size: 12px; color: #8E9BB2`)}>{s.time}</div> : null}
                        </div>
                        <div style={css('font-size: 13.5px; color: #A3AEC2; margin-top: 4px; line-height: 1.5; overflow-wrap: anywhere')}>{s.note}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section style={card('padding: 26px 30px')}>
              <div style={css(`${H2}; margin-bottom: 16px`)}>Steps to reproduce</div>
              {bug.recipe.length === 0 ? (
                <div style={css('font-size: 14px; color: #A3AEC2')}>The record has no recipe.</div>
              ) : (
                <div style={css('display: flex; flex-wrap: wrap; gap: 10px; align-items: center')}>
                  {bug.recipe.map((text, i) => (
                    <div key={`${String(i)}-${text}`} style={css('display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04)')}>
                      <span style={css(`width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 800; font-family: ${MONO}`)}>{i + 1}</span>
                      <span style={css('font-size: 13.5px; font-weight: 600; overflow-wrap: anywhere')}>{text}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={css('display: flex; flex-wrap: wrap; gap: 14px; margin-top: 20px')}>
                <div style={css('flex: 1 1 240px; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; padding: 14px 16px')}>
                  <div style={css('font-size: 12px; color: #8E9BB2; font-weight: 700')}>Expected</div>
                  <div style={css('font-size: 15px; margin-top: 5px; font-weight: 600; overflow-wrap: anywhere')}>{bug.expected}</div>
                </div>
                <div style={css('flex: 1 1 240px; border: 1px solid rgba(255,107,91,0.6); background: rgba(255,107,91,0.09); border-radius: 14px; padding: 14px 16px; box-shadow: 0 0 36px -12px rgba(255,107,91,0.7)')}>
                  <div style={css('font-size: 12px; color: #FF8A7B; font-weight: 700')}>Actual</div>
                  <div style={css('font-size: 15px; margin-top: 5px; font-weight: 600; overflow-wrap: anywhere')}>{bug.actual}</div>
                </div>
              </div>
              <div style={css('margin-top: 14px; font-size: 12.5px; color: #8E9BB2')}>Found on {shortStamp(new Date(bug.createdAt))} in run {bug.runId}</div>
            </section>

            <section style={card('padding: 26px 30px')}>
              <div style={css(`${H2}; margin-bottom: 16px`)}>Evidence</div>
              {ev.videos.length === 0 && ev.images.length === 0 && ev.traces.length === 0 ? (
                <div style={css('font-size: 14px; color: #A3AEC2')}>No screenshots or video were saved for this bug.</div>
              ) : null}
              {ev.videos.map((v) => (
                <video key={v} controls preload="metadata" src={fileUrl(bug.runId, v)} style={css('display: block; width: 100%; border-radius: 14px; background: #05080D; margin-bottom: 14px')} />
              ))}
              {ev.images.length > 0 ? (
                <div style={css('display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px')}>
                  {ev.images.map((p) => (
                    <a key={p} href={fileUrl(bug.runId, p)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileUrl(bug.runId, p)} alt="Screenshot of the bug" style={css('display: block; width: 100%; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12)')} />
                    </a>
                  ))}
                </div>
              ) : null}
              {ev.traces.map((t) => (
                <a key={t} href={fileUrl(bug.runId, t)} download style={css(`display: inline-block; margin-top: 14px; font-size: 13.5px; font-weight: 800; color: ${ACCENT}`)}>
                  Download Playwright trace
                </a>
              ))}
            </section>

            <section style={card('overflow: hidden')}>
              <div style={css('padding: 18px 26px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.07)')}>
                <div style={css(H2)}>Failing test</div>
                {bug.test ? <span style={css(`font-family: ${MONO}; font-size: 12.5px; color: #8E9BB2; overflow-wrap: anywhere`)}>{bug.test.repoPath}</span> : null}
              </div>
              {spec ? (
                <div style={css(`background: #05080D; padding: 20px 26px; overflow-x: auto; font-family: ${MONO}; font-size: 13px; line-height: 1.8; color: #EAF0FA`)}>
                  {lines.map((line, i) => (
                    <div key={i} style={css('white-space: pre; min-height: 23px')}>
                      {highlight(line).map((tk, j) => (
                        <span key={j} style={tk.c ? css(`color: ${tk.c}`) : undefined}>
                          {tk.t}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={css('padding: 20px 26px; font-size: 14px; color: #A3AEC2')}>{bug.test ? 'The test file could not be read.' : 'No failing test was written for this bug.'}</div>
              )}
              <div style={css('padding: 14px 26px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; border-top: 1px solid rgba(255,255,255,0.07)')}>
                <span style={css(`font-size: 12.5px; font-weight: 800; color: ${bug.test?.proven ? '#FF8A7B' : '#B4BFD2'}; background: ${bug.test?.proven ? 'rgba(255,107,91,0.18)' : 'rgba(142,155,178,0.2)'}; padding: 5px 12px; border-radius: 99px`)}>
                  {bug.test?.proven ? 'Run on staging: failed' : 'Not proven'}
                </span>
                <span style={css('font-size: 13px; color: #A3AEC2')}>{bug.test?.proven ? 'It was run and failed for the bug’s reason. NightQA never runs it from this page.' : bug.statusNote}</span>
              </div>
            </section>
          </div>

          <aside style={css('flex: 1 1 400px; min-width: 0; display: flex; flex-direction: column; gap: 22px')}>
            <section style={css(`padding: 26px 28px; border-radius: 24px; border: 1px solid rgba(52,227,203,0.55); background: linear-gradient(180deg, rgba(52,227,203,0.10), rgba(52,227,203,0.02)); box-shadow: 0 0 70px -20px rgba(52,227,203,0.55), inset 0 1px 0 rgba(255,255,255,0.08)`)}>
              <div style={css('display: flex; justify-content: space-between; align-items: center')}>
                <div style={css(H2)}>Fix status</div>
                {bug.pull ? <span style={css(`font-family: ${MONO}; font-size: 12px; color: #A3AEC2`)}>PR #{bug.pull.number}</span> : null}
              </div>
              <div style={css('display: flex; flex-direction: column; margin-top: 12px')}>
                {[
                  ['Reproduced', `${String(bug.reproduced)} of ${String(bug.attempts)}`, proven],
                  ['Failing test ran and failed', bug.test ? (bug.test.proven ? 'Yes' : 'No') : 'No test', bug.test?.proven === true],
                  ['Fix pull request', bug.pull ? bug.pull.state : 'None yet', bug.pull?.state === 'merged'],
                ].map(([label, value, ok]) => (
                  <div key={String(label)} style={css('display: flex; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid rgba(255,255,255,0.08)')}>
                    <span style={css(`flex: 0 0 22px; height: 22px; border-radius: 50%; background: ${ok ? 'rgba(52,227,203,0.18)' : 'rgba(255,255,255,0.06)'}; color: ${ok ? ACCENT : '#6F7C94'}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800`)}>{ok ? '✓' : '–'}</span>
                    <span style={css('flex: 1; font-size: 14px; font-weight: 600')}>{label}</span>
                    <span style={css(`font-size: 12.5px; color: #A3AEC2; font-family: ${MONO}`)}>{value}</span>
                  </div>
                ))}
              </div>
              {bug.pull?.state === 'open' && pullHref ? (
                <a href={pullHref} target="_blank" rel="noreferrer noopener" style={css(`display: flex; align-items: center; justify-content: center; width: 100%; box-sizing: border-box; min-height: 54px; margin-top: 16px; border-radius: 15px; background: ${ACCENT}; color: #03211D; font-size: 15.5px; font-weight: 800; box-shadow: 0 12px 40px -8px rgba(52,227,203,0.75)`)}>
                  Review and merge on GitHub
                </a>
              ) : null}
              {isMember ? (
                <>
                  <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 16px')}>Not right? Record why, so NightQA learns.</div>
                  <div style={css('margin-top: 10px')}>
                    <CloseReasons run={bug.runId} id={bug.id} current={bug.closeReason} />
                  </div>
                </>
              ) : (
                <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 16px')}>Your account is view-only, so closing a bug is turned off.</div>
              )}
            </section>

            {isMember && canAskForFix(bug) ? (
              <section style={card('padding: 22px 26px')}>
                <div style={css('font-size: 16px; font-weight: 800')}>Ask for a fix</div>
                <div style={css('font-size: 13px; color: #A3AEC2; margin: 6px 0 12px; line-height: 1.5')}>
                  {bug.fix?.note ? `${bug.fix.note}. ` : 'No fix was requested. '}NightQA owns every GitHub write, so paste this comment on issue #{bug.issue?.number} yourself.
                </div>
                <CopyComment text={fixComment(bug)} />
              </section>
            ) : null}

            <section style={card('padding: 22px 26px')}>
              <div style={css('font-size: 13px; color: #A3AEC2; font-weight: 700')}>On GitHub</div>
              {bug.issue || bug.pull ? (
                <div style={css('display: flex; flex-direction: column; gap: 14px; margin-top: 14px')}>
                  {bug.issue ? (
                    <div style={css('display: flex; gap: 12px; align-items: flex-start')}>
                      <span style={css(`width: 10px; height: 10px; border-radius: 50%; background: ${ACCENT}; margin-top: 6px; box-shadow: 0 0 10px ${ACCENT}; flex: 0 0 auto`)} />
                      <div>
                        <div style={css('font-size: 14.5px; font-weight: 700')}>
                          <Link2 href={issueHref}>Issue #{bug.issue.number}</Link2> · {bug.issue.state}
                        </div>
                        <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 3px')}>{bug.issue.action === 'seen_again' ? 'Seen again by a later run.' : 'Opened by NightQA with the evidence, recipe and test.'}</div>
                      </div>
                    </div>
                  ) : null}
                  {bug.pull ? (
                    <div style={css('display: flex; gap: 12px; align-items: flex-start')}>
                      <span style={css(`width: 10px; height: 10px; border-radius: 50%; background: ${COLORS.blue}; margin-top: 6px; box-shadow: 0 0 10px ${COLORS.blue}; flex: 0 0 auto`)} />
                      <div>
                        <div style={css('font-size: 14.5px; font-weight: 700')}>
                          <Link2 href={pullHref}>PR #{bug.pull.number}</Link2> · {bug.pull.state}
                        </div>
                        <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 3px')}>A human merges every fix.</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={css('font-size: 14px; color: #A3AEC2; margin-top: 10px; line-height: 1.5')}>{bug.statusNote || 'This bug was not sent to GitHub.'}</div>
              )}
            </section>

            <section style={card('padding: 20px 26px')}>
              <div style={css('font-size: 13px; color: #A3AEC2; font-weight: 700')}>Merged fix rate</div>
              <div style={css(`font-size: 22px; font-weight: 800; margin-top: 6px; font-family: ${MONO}`)}>{rate ?? '—'}</div>
              <div style={css('font-size: 13px; color: #A3AEC2; margin-top: 6px; line-height: 1.5')}>{rate ? 'Share of closed fix PRs that were merged.' : 'No fix PR has closed yet.'}</div>
              <Link href="/autonomy" style={css(`display: inline-block; margin-top: 12px; font-size: 13.5px; font-weight: 800; color: ${ACCENT}`)}>Review autonomy policy</Link>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
