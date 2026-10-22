import { listBugs, type BugRecord } from '../bugs';
import { buildReport, previewWindow, type Report } from '../report';
import { listRuns, type RunView } from '../results';
import { getSettings, type Settings } from '../settings';
import { channelStates, type ChannelState } from './dispatch';
import { recentDeliveries, type Delivery } from './log';
import { buildAlertFeed, type AlertFeed } from './view';
import { listSecretNames } from '../vault';

export interface NotifyData {
  readonly now: Date;
  readonly settings: Settings;
  readonly states: ChannelState[];
  readonly runs: RunView[];
  readonly bugs: BugRecord[];
  readonly deliveries: Delivery[];
  /** The morning report as it would be built right now (or for the latest night when nothing is recent). */
  readonly report: Report;
  /** The window the report covers. */
  readonly window: { since: Date; asOf: Date };
  readonly feed: AlertFeed;
}

/** Everything the notification screens show, read from the real results folder, settings and delivery log. */
export async function loadNotifyData(now: Date = new Date()): Promise<NotifyData> {
  const [settings, names, runs, bugs, deliveries] = await Promise.all([getSettings(), listSecretNames().catch(() => []), listRuns(), listBugs(), recentDeliveries(40)]);
  const win = previewWindow(runs, now);
  const report = buildReport({ runs, bugs, appName: settings.app.name, now: win.asOf, since: win.since, timeZone: settings.schedule.timezone, quietNight: settings.schedule.quietNight });
  return { now, window: win, settings, states: channelStates(settings, names), runs, bugs, deliveries, report, feed: buildAlertFeed({ bugs, deliveries, now }) };
}
