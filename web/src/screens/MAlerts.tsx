import Link from 'next/link';
import { connection } from 'next/server';
import { QuietNightToggle } from '@/components/QuietNightToggle';
import { currentViewer } from '@/lib/auth/server';
import { css } from '@/lib/dc';
import { COLORS } from '@/lib/format';
import { loadNotifyData } from '@/lib/notify/load';
import { whenLabel } from '@/lib/notify/view';
import { clean } from '@/lib/report';
import TabBar from './TabBar';
import { FONT, MONO } from './live/ui';
import { FEED_COLOR, feedDot } from './live/notifyUi';

const ACCENT = COLORS.accent;

/** The alert feed: the newest open critical bug, then real events (bugs, PRs, deliveries), newest first. */
export default async function MAlerts() {
  await connection();
  const [{ settings, feed, now }, viewer] = await Promise.all([loadNotifyData(), currentViewer()]);
  const tz = settings.schedule.timezone;
  const c = feed.critical;

  return (
    <div style={css(`width: 390px; max-width: 100%; min-height: 100vh; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; font-family: ${FONT}; color: #EAF0FA; background: radial-gradient(460px 340px at 50% -80px, rgba(255,107,91,0.26), transparent 65%), radial-gradient(380px 300px at 100% 70%, rgba(52,227,203,0.10), transparent 65%), #070A10`)}>
      <header style={css('padding: 26px 20px 8px')}>
        <div style={css(`font-size: 11.5px; letter-spacing: 1.3px; text-transform: uppercase; font-weight: 800; color: ${ACCENT}`)}>Alerts</div>
        <h1 style={css('margin: 6px 0 0; font-size: 30px; font-weight: 800; letter-spacing: -1.1px')}>What needs you now</h1>
      </header>

      <main style={css('flex: 1; min-height: 0; padding: 12px 20px 0; display: flex; flex-direction: column; gap: 16px')}>
        {c ? (
          <Link
            href={`/m/bug?run=${encodeURIComponent(c.bug.runId)}&id=${encodeURIComponent(c.bug.id)}`}
            style={css('display: block; padding: 20px 20px 18px; border-radius: 26px; border: 1px solid rgba(255,107,91,0.65); background: linear-gradient(180deg, rgba(255,107,91,0.22), rgba(255,107,91,0.05)); box-shadow: 0 0 70px -16px rgba(255,107,91,0.75), inset 0 1px 0 rgba(255,255,255,0.12)')}
          >
            <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 8px')}>
              <span style={css('font-size: 12px; font-weight: 800; color: #FFFFFF; background: #FF6B5B; padding: 5px 12px; border-radius: 99px; box-shadow: 0 0 22px rgba(255,107,91,0.8)')}>Critical</span>
              <span style={css(`font-family: ${MONO}; font-size: 12px; color: #FFB4AA; text-align: right`)}>{c.sentLabel}</span>
            </div>
            <div style={css('font-size: 22px; font-weight: 800; letter-spacing: -0.6px; margin-top: 14px; line-height: 1.2; overflow-wrap: anywhere')}>{clean(c.bug.title)}</div>
            <div style={css('font-size: 13.5px; color: #FFCFC9; margin-top: 8px; line-height: 1.5')}>
              {clean(c.bug.flow, 60)} · reproduced {c.bug.reproduced} of {c.bug.attempts} · {c.bug.test?.proven ? 'failing test attached' : 'failing test not attached yet'}
            </div>
            <div style={css('display: flex; gap: 10px; margin-top: 16px')}>
              <span style={css('flex: 1; min-height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: #FFFFFF; color: #3A0D08; font-size: 14.5px; font-weight: 800')}>Open the bug</span>
            </div>
          </Link>
        ) : (
          <div style={css('padding: 20px; border-radius: 26px; border: 1px solid rgba(255,255,255,0.1); background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))')}>
            <div style={css('font-size: 18px; font-weight: 800; letter-spacing: -0.4px')}>Nothing critical right now</div>
            <div style={css('font-size: 13px; color: #A3AEC2; margin-top: 6px; line-height: 1.5')}>
              {settings.notifications.criticalImmediately ? 'When a proven critical bug appears it is sent to you right away and shown here.' : 'Critical alerts are switched off. Turn them on in Notifications.'}
            </div>
          </div>
        )}

        <section style={css('display: flex; flex-direction: column')}>
          <div style={css('font-size: 15px; font-weight: 800; margin-bottom: 4px')}>{c ? 'Earlier' : 'Recent'}</div>
          {feed.earlier.length === 0 ? (
            <div style={css('padding: 14px 0; border-top: 1px solid rgba(255,255,255,0.08); font-size: 13px; color: #A3AEC2; line-height: 1.5')}>No alerts yet. Bugs, fix PRs and sent reports appear here after the first run.</div>
          ) : null}
          {feed.earlier.map((n, i) => (
            <div key={`${n.at.toISOString()}-${String(i)}`} style={css('display: flex; gap: 14px; align-items: flex-start; padding: 14px 0; border-top: 1px solid rgba(255,255,255,0.08)')}>
              <span aria-hidden="true" style={feedDot(FEED_COLOR[n.color])} />
              <div style={css('flex: 1; min-width: 0')}>
                <div style={css('font-size: 14.5px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere')}>{n.title}</div>
                <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 3px')}>{whenLabel(n.at, now, tz)}</div>
              </div>
            </div>
          ))}
        </section>

        <section style={css('display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.04); margin-bottom: 8px')}>
          <div style={css('flex: 1')}>
            <div style={css('font-size: 14px; font-weight: 800')}>Quiet night</div>
            <div style={css('font-size: 12.5px; color: #A3AEC2; margin-top: 3px; line-height: 1.4')}>Send a one-line “all clear” when nothing is found.</div>
          </div>
          <QuietNightToggle on={settings.schedule.quietNight === 'all_clear'} readOnly={viewer?.role !== 'member'} accent={ACCENT} />
        </section>
      </main>
      <TabBar active="Alerts" accent={ACCENT} />
    </div>
  );
}
