'use client';

import { useState } from 'react';
import type { Settings } from '@/lib/settings';
import { Field, Result, disabledIf, inputStyle, primaryBtn, useSend } from './fields';

export interface ScheduleValues {
  readonly schedule: Settings['schedule'];
  readonly budgets: Settings['budgets'];
  readonly maxFixPerNight: number;
  readonly explorationMaxSteps: number;
}

const tile = { padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: 6 } as const;

/** Nightly time, morning report, quiet-night behaviour and the per-run budgets. */
export function ScheduleForm({ initial, readOnly }: { initial: ScheduleValues; readOnly: boolean }) {
  const [v, setV] = useState({
    nightlyEnabled: initial.schedule.nightlyEnabled,
    nightlyTime: initial.schedule.nightlyTime,
    timezone: initial.schedule.timezone,
    morningReportTime: initial.schedule.morningReportTime,
    quietNight: initial.schedule.quietNight,
    maxSteps: String(initial.budgets.maxSteps),
    maxSeconds: String(initial.budgets.maxSeconds),
    maxCostUsd: String(initial.budgets.maxCostUsd),
    maxFixPerNight: String(initial.maxFixPerNight),
    explorationMaxSteps: String(initial.explorationMaxSteps),
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => { setV((p) => ({ ...p, [k]: e.target.value })); };
  const { send, busy, outcome } = useSend();
  const num = (k: keyof typeof v): number => Number(v[k]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send(
          '/api/settings/schedule',
          'POST',
          {
            schedule: { nightlyEnabled: v.nightlyEnabled, nightlyTime: v.nightlyTime, timezone: v.timezone, morningReportTime: v.morningReportTime, quietNight: v.quietNight },
            budgets: { maxSteps: num('maxSteps'), maxSeconds: num('maxSeconds'), maxCostUsd: num('maxCostUsd') },
            maxFixPerNight: num('maxFixPerNight'),
            explorationMaxSteps: num('explorationMaxSteps'),
          },
          'Saved.',
        );
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <Field id="nt" label="Nightly run time" grow="1 1 160px"><input id="nt" type="time" value={v.nightlyTime} readOnly={readOnly} onChange={set('nightlyTime')} style={inputStyle(false)} /></Field>
        <Field id="rt" label="Morning report" grow="1 1 160px"><input id="rt" type="time" value={v.morningReportTime} readOnly={readOnly} onChange={set('morningReportTime')} style={inputStyle(false)} /></Field>
        <Field id="tz" label="Time zone" grow="1 1 200px"><input id="tz" value={v.timezone} readOnly={readOnly} onChange={set('timezone')} style={inputStyle(false)} /></Field>
        <Field id="qn" label="On a quiet night" grow="1 1 200px">
          <select id="qn" value={v.quietNight} disabled={readOnly} onChange={set('quietNight')} style={inputStyle(false)}>
            <option value="all_clear">Send a one-line all clear</option>
            <option value="nothing">Send nothing</option>
          </select>
        </Field>
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, fontWeight: 700 }}>
        <input type="checkbox" checked={v.nightlyEnabled} disabled={readOnly} onChange={(e) => { setV((p) => ({ ...p, nightlyEnabled: e.target.checked })); }} /> Nightly runs enabled
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {([
          ['maxFixPerNight', 'Fix PRs per night', '1', 0, 20],
          ['explorationMaxSteps', 'Exploration steps per session', '1', 5, 100],
          ['maxSteps', 'Steps per run', '1', 5, 200],
          ['maxSeconds', 'Seconds per run', '1', 30, 1800],
          ['maxCostUsd', 'AI cost cap per run (USD)', '0.01', 0.01, 20],
        ] as const).map(([k, label, step, min, max]) => (
          <div key={k} style={tile}>
            <label htmlFor={k} style={{ fontSize: 12.5, color: '#A3AEC2' }}>{label}</label>
            <input id={k} type="number" min={min} max={max} step={step} value={v[k]} readOnly={readOnly} onChange={set(k)} style={{ ...inputStyle(false), minHeight: 44, fontSize: 18, fontWeight: 800 }} />
          </div>
        ))}
      </div>
      {readOnly ? null : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, ...disabledIf(busy) }}>{busy ? 'Saving...' : 'Save schedule and limits'}</button>
          <Result outcome={outcome} />
        </div>
      )}
    </form>
  );
}
