import Link from 'next/link';
import { connection } from 'next/server';
import { NotificationChannels } from '@/components/NotificationChannels';
import { currentViewer } from '@/lib/auth/server';
import { css } from '@/lib/dc';
import { COLORS } from '@/lib/format';
import { loadNotifyData } from '@/lib/notify/load';
import { safeDashboardUrl, slackSafe } from '@/lib/notify/format';
import { timeLabel, whenLabel, zoneLabel } from '@/lib/notify/view';
import type { Report } from '@/lib/report';
import Topbar from './Topbar';
import { FONT, MONO, card, chip, emptyCard, eyebrow, h1, main, pageBg } from './live/ui';
import { reportChip } from './live/notifyUi';

const ACCENT = COLORS.accent;
const SECTION = 'border-radius: 22px; border: 1px solid rgba(255,255,255,0.1); background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.016)); box-shadow: 0 30px 60px -30px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.08); overflow: hidden';
const SLACK_TAG: Record<string, { text: string; color: string }> = {
  crit: { text: 'CRITICAL', color: '#FF8A7B' },
  high: { text: 'HIGH', color: '#FF8A7B' },
  med: { text: 'MED', color: '#FFC14D' },
  low: { text: 'LOW', color: '#8DB8FF' },
  setup: { text: 'Needs setup:', color: '#B9A6FF' },
  look: { text: 'Needs a look:', color: '#B4BFD2' },
};

function NoData({ what }: { what: string }) {
  return (
    <div style={css('padding: 22px 24px; font-size: 14px; color: #A3AEC2; line-height: 1.55')}>
      <div style={css('font-size: 15px; font-weight: 800; color: #EAF0FA; margin-bottom: 6px')}>No runs in the last night yet</div>
      {what}
    </div>
  );
}

function EmailPreview({ report, appName }: { report: Report; appName: string }) {
  return (
    <section style={css(`flex: 1 1 460px; max-width: 560px; min-width: 0; ${SECTION}`)}>
      <div style={css('padding: 16px 22px; border-bottom: 1px solid rgba(255,255,255,0.08)')}>
        <div style={css('font-size: 12px; color: #8E9BB2')}>Email · from NightQA · preview</div>
        <div style={css('font-size: 15.5px; font-weight: 800; margin-top: 4px; line-height: 1.3')}>{report.subject}</div>
      </div>
      {report.kind === 'no_runs' ? (
        <NoData what={`When ${appName} has run at least one flow, your morning email appears here, built from the real results.`} />
      ) : (
        <div style={css('padding: 22px 24px; display: flex; flex-direction: column; gap: 14px')}>
          {report.summary.map((s) => (
            <div key={s} style={css('font-size: 14px; color: #C7D0E0; line-height: 1.5')}>{s}</div>
          ))}
          {report.items.map((r, i) => (
            <div key={`${r.tag}-${String(i)}`} style={css('display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08)')}>
              <span style={reportChip(r.tone)}>{r.tag}</span>
              <div style={css('min-width: 0')}>
                <div style={css('font-size: 14px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere')}>{r.title}</div>
                <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 3px')}>{r.refs}</div>
              </div>
            </div>
          ))}
          {report.notes.map((n) => (
            <div key={n} style={css('font-size: 13px; color: #A3AEC2')}>{n}</div>
          ))}
          {!report.send ? <div style={css('font-size: 12.5px; color: #FFC14D')}>Quiet night is set to send nothing, so this would not be sent.</div> : null}
          <Link href="/" style={css(`align-self: flex-start; min-height: 46px; box-sizing: border-box; padding: 0 22px; border-radius: 13px; background: ${ACCENT}; color: #03211D; display: inline-flex; align-items: center; font-size: 14.5px; font-weight: 800`)}>
            Open the full report
          </Link>
        </div>
      )}
    </section>
  );
}

function SlackPreview({ report, time, dashboard }: { report: Report; time: string; dashboard: string | undefined }) {
  return (
    <section style={css('border-radius: 22px; border: 1px solid rgba(255,255,255,0.1); background: #11101A; box-shadow: 0 30px 60px -30px rgba(0,0,0,0.9); overflow: hidden')}>
      <div style={css('padding: 12px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13.5px; font-weight: 800')}>Slack · incoming webhook · preview</div>
      {report.kind === 'no_runs' ? (
        <NoData what="The Slack message is built from the same data as the email." />
      ) : (
        <div style={css('padding: 18px 20px; display: flex; gap: 14px; align-items: flex-start')}>
          <div aria-hidden="true" style={css(`flex: 0 0 38px; width: 38px; height: 38px; border-radius: 10px; background: ${ACCENT}; position: relative; overflow: hidden`)}>
            <div style={css('position: absolute; left: 15px; top: -5px; width: 34px; height: 34px; border-radius: 50%; background: #11101A')} />
          </div>
          <div style={css('flex: 1; min-width: 0')}>
            <div style={css('font-size: 14px; font-weight: 800')}>
              NightQA <span style={css('font-weight: 500; color: #8E9BB2; font-size: 12px')}>{time}</span>
            </div>
            <div style={css('font-size: 14px; margin-top: 6px; line-height: 1.55; color: #D6DDEA; overflow-wrap: anywhere')}>
              <b>{slackSafe(report.subject)}</b>
              {report.summary.map((s) => (
                <span key={s}><br />{s}</span>
              ))}
              {report.items.map((i, idx) => {
                const t = SLACK_TAG[i.tone] ?? { text: i.tag, color: '#B4BFD2' };
                return (
                  <span key={`${i.tag}-${String(idx)}`}>
                    <br />
                    <span style={css(`color: ${t.color}; font-weight: 700`)}>{t.text}</span> {slackSafe(i.title)} → {i.refs}
                  </span>
                );
              })}
              {report.notes.map((n) => (
                <span key={n}><br />{n}</span>
              ))}
              {dashboard ? <span><br /><span style={css(`color: ${ACCENT}`)}>Open dashboard</span></span> : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Unavailable({ name, why }: { name: string; why: string }) {
  return (
    <section style={css('flex: 1 1 260px; border-radius: 22px; border: 1px dashed rgba(255,255,255,0.18); background: rgba(255,255,255,0.025); padding: 18px 20px; display: flex; flex-direction: column; gap: 8px')}>
      <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 8px')}>
        <span style={css('font-size: 14px; font-weight: 800')}>{name}</span>
        <span style={chip('#B4BFD2', 'rgba(142,155,178,0.2)')}>Not available yet</span>
      </div>
      <div style={css('font-size: 13px; color: #A3AEC2; line-height: 1.5')}>{why}</div>
    </section>
  );
}

/** Notifications: what NightQA sends, built from the real data, with live channel settings and the delivery log. */
export default async function Reports() {
  await connection();
  const [data, viewer] = await Promise.all([loadNotifyData(), currentViewer()]);
  const { settings, report, feed, deliveries, states, now } = data;
  const tz = settings.schedule.timezone;
  const readOnly = viewer?.role !== 'member';
  const dashboard = safeDashboardUrl(process.env.NIGHTQA_PUBLIC_URL);
  const labels = { email: 'Email', slack: 'Slack', webhook: 'Webhook' } as const;
  const criticalNow = feed.critical;

  return (
    <div style={pageBg()}>
      <Topbar accent={ACCENT} />
      <main style={main('48px 40px 64px')}>
        <header>
          <div style={eyebrow(ACCENT)}>
            Notifications · {timeLabel(settings.schedule.morningReportTime)} {zoneLabel(tz, now)} by default
          </div>
          <h1 style={h1}>One short report, wherever you read</h1>
        </header>

        <div style={css('display: flex; flex-wrap: wrap; gap: 32px; align-items: flex-start')}>
          <EmailPreview report={report} appName={settings.app.name} />
          <div style={css('flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 28px')}>
            <SlackPreview report={report} time={timeLabel(settings.schedule.morningReportTime)} dashboard={dashboard} />
            <div style={css('display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start')}>
              <Unavailable name="WhatsApp" why="Needs a messaging provider. None is connected, so nothing is sent and no preview is shown." />
              <section style={css('flex: 1 1 260px; display: flex; flex-direction: column; gap: 12px')}>
                {criticalNow ? (
                  <div style={css('padding: 16px 18px; border-radius: 22px; border: 1px solid rgba(255,107,91,0.65); background: linear-gradient(180deg, rgba(255,107,91,0.2), rgba(255,107,91,0.05)); box-shadow: 0 0 60px -16px rgba(255,107,91,0.7), inset 0 1px 0 rgba(255,255,255,0.1)')}>
                    <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 8px')}>
                      <span style={css('font-size: 12px; font-weight: 800; letter-spacing: 0.5px; color: #FFB4AA')}>NIGHTQA · CRITICAL</span>
                      <span style={css('font-size: 11.5px; color: #FFB4AA')}>latest</span>
                    </div>
                    <div style={css('font-size: 15px; font-weight: 800; margin-top: 8px; line-height: 1.3; overflow-wrap: anywhere')}>{criticalNow.bug.title}</div>
                    <div style={css('font-size: 12.5px; color: #FFCFC9; margin-top: 4px')}>{criticalNow.sentLabel}. Sent right after confirmation, not held for the morning.</div>
                  </div>
                ) : (
                  <div style={css('padding: 16px 18px; border-radius: 22px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05)')}>
                    <div style={css('font-size: 12px; font-weight: 800; color: #A3AEC2')}>CRITICAL ALERTS</div>
                    <div style={css('font-size: 14px; font-weight: 700; margin-top: 6px; line-height: 1.4')}>No critical bug right now.</div>
                    <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 4px; line-height: 1.45')}>{settings.notifications.criticalImmediately ? 'A proven critical bug is sent right away, not held for the morning.' : 'Critical alerts are switched off. They would go out with the morning report.'}</div>
                  </div>
                )}
                <Unavailable name="Push" why="Needs a mobile app or a push provider. None exists yet." />
              </section>
            </div>
          </div>
        </div>

        <section style={card('padding: 26px 28px 12px')}>
          <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px')}>Channels</div>
          <div style={css('font-size: 13.5px; color: #A3AEC2; margin: 4px 0 8px')}>
            Switch a channel on, check that it is connected, and send a clearly labelled test message. Secrets are saved in Settings and never shown here.
          </div>
          <NotificationChannels
            accent={ACCENT}
            readOnly={readOnly}
            emailTo={settings.notifications.email.to}
            criticalImmediately={settings.notifications.criticalImmediately}
            quietNightAllClear={settings.schedule.quietNight === 'all_clear'}
            rows={states.map((s) => ({ channel: s.channel, label: labels[s.channel], enabled: s.enabled, configured: s.configured, detail: s.detail }))}
          />
        </section>

        <section style={card('padding: 26px 28px 16px')}>
          <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px')}>Delivery log</div>
          <div style={css('font-size: 13.5px; color: #A3AEC2; margin: 4px 0 12px')}>Every message NightQA tried to send, newest first.</div>
          {deliveries.length === 0 ? (
            <div style={emptyCard}>
              <div style={css('font-size: 16.5px; font-weight: 700')}>Nothing sent yet</div>
              <div style={css('font-size: 13px; color: #A3AEC2; max-width: 460px; line-height: 1.5')}>The morning report, critical alerts and test messages show up here with whether each one was delivered.</div>
            </div>
          ) : (
            <div style={css('display: flex; flex-direction: column')}>
              {deliveries.slice(0, 20).map((d, i) => (
                <div key={`${d.at}-${d.channel}-${String(i)}`} style={css('display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; padding: 12px 0; border-top: 1px solid rgba(255,255,255,0.08)')}>
                  <span style={css(`font-family: ${MONO}; font-size: 12px; color: #8E9BB2; flex: 0 0 150px`)}>{whenLabel(new Date(d.at), now, tz)}</span>
                  <span style={css('flex: 0 0 80px; font-size: 13.5px; font-weight: 700')}>{labels[d.channel]}</span>
                  <span style={css('flex: 0 0 72px; font-size: 12.5px; color: #A3AEC2')}>{d.kind === 'morning' ? 'Report' : d.kind === 'critical' ? 'Critical' : 'Test'}</span>
                  <span style={chip(d.ok ? ACCENT : '#FF8A7B', d.ok ? 'rgba(52,227,203,0.13)' : 'rgba(255,107,91,0.18)')}>{d.ok ? 'Sent' : 'Failed'}</span>
                  <span style={css('flex: 1 1 240px; min-width: 0; font-size: 12.5px; color: #A3AEC2; overflow-wrap: anywhere')}>{d.ok ? (d.subject ?? '') : d.reason}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <div style={css(`font-size: 12px; color: #6F7C94; font-family: ${FONT}`)}>Previews are built from the real results folder with the same code that sends the messages.</div>
      </main>
    </div>
  );
}
