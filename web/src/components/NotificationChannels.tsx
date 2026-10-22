'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Switch } from './Switch';

export interface ChannelRow {
  readonly channel: 'email' | 'slack' | 'webhook';
  readonly label: string;
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly detail: string;
}

interface Props {
  readonly rows: readonly ChannelRow[];
  readonly emailTo: readonly string[];
  readonly criticalImmediately: boolean;
  readonly quietNightAllClear: boolean;
  readonly readOnly: boolean;
  readonly accent: string;
}

const BTN = { minHeight: 44, padding: '0 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#EAF0FA', fontFamily: 'inherit', fontSize: 14, fontWeight: 700 } as const;

async function post(url: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: unknown; reason?: unknown; ok?: unknown };
    const text = typeof data.error === 'string' ? data.error : typeof data.reason === 'string' ? data.reason : '';
    return { ok: res.ok && data.ok !== false, message: text };
  } catch {
    return { ok: false, message: 'Could not reach the dashboard.' };
  }
}

/** Channel switches, recipients, test messages and the two behaviour switches. Saves through the notifications route. */
export function NotificationChannels({ rows, emailTo, criticalImmediately, quietNightAllClear, readOnly, accent }: Props) {
  const router = useRouter();
  const [recipients, setRecipients] = useState(emailTo.join(', '));
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<Record<string, { ok: boolean; message: string }>>({});

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message: string }>, refresh = true): Promise<void> => {
    setBusy(key);
    const r = await fn();
    setNotes((n) => ({ ...n, [key]: r }));
    setBusy('');
    if (refresh) router.refresh();
  };
  const save = (key: string, body: unknown): Promise<void> => run(key, async () => {
    const r = await post('/api/settings/notifications', body);
    return { ok: r.ok, message: r.ok ? 'Saved.' : r.message || 'Could not save.' };
  });
  const test = (channel: string): Promise<void> => run(`test-${channel}`, async () => {
    const r = await post('/api/notifications/test', { channel });
    return { ok: r.ok, message: r.ok ? 'Test message sent.' : r.message || 'The test message could not be sent.' };
  });

  const note = (key: string) => {
    const n = notes[key];
    return n ? (
      <span role="status" style={{ fontSize: 12.5, color: n.ok ? accent : '#FF8A7B' }}>
        {n.message}
      </span>
    ) : null;
  };
  const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center', padding: '16px 0', borderTop: '1px solid rgba(255,255,255,0.08)' } as const;

  return (
    <div>
      {rows.map((r) => (
        <div key={r.channel} style={rowStyle}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>{r.label}</div>
            <div style={{ fontSize: 12.5, color: '#A3AEC2', marginTop: 3 }}>
              <span style={{ color: r.configured ? accent : '#FFC14D', fontWeight: 700 }}>{r.configured ? 'Connected' : 'Not connected'}</span> · {r.detail}
            </div>
          </div>
          {r.channel === 'email' ? (
            <div style={{ flex: '2 1 280px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                aria-label="Email recipients, separated by commas"
                value={recipients}
                disabled={readOnly}
                placeholder="you@example.com, team@example.com"
                onChange={(e) => {
                  setRecipients(e.target.value);
                }}
                style={{ flex: '1 1 220px', minHeight: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.05)', color: '#EAF0FA', fontFamily: 'inherit', fontSize: 14 }}
              />
              <button
                type="button"
                disabled={readOnly || busy !== ''}
                onClick={() => {
                  void save('email-to', { email: { to: recipients.split(/[,\s;]+/).filter(Boolean) } });
                }}
                style={BTN}
              >
                Save recipients
              </button>
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={readOnly || busy !== '' || !r.configured}
              title={r.configured ? undefined : 'Connect this channel first'}
              onClick={() => {
                void test(r.channel);
              }}
              style={{ ...BTN, opacity: readOnly || !r.configured ? 0.5 : 1 }}
            >
              {busy === `test-${r.channel}` ? 'Sending…' : 'Send test message'}
            </button>
            <Switch
              on={r.enabled}
              label={`${r.label} on or off`}
              accent={accent}
              disabled={readOnly}
              busy={busy !== ''}
              onChange={(next) => {
                void save(`toggle-${r.channel}`, r.channel === 'email' ? { email: { enabled: next } } : { [r.channel]: { enabled: next } });
              }}
            />
          </div>
          <div style={{ flex: '1 1 100%' }}>{note(`test-${r.channel}`) ?? note(`toggle-${r.channel}`) ?? (r.channel === 'email' ? note('email-to') : null)}</div>
        </div>
      ))}
      {[
        { key: 'critical', title: 'Critical bugs right away', body: 'Send an alert as soon as a proven critical bug appears, instead of waiting for the morning report.', on: criticalImmediately, patch: (n: boolean) => ({ criticalImmediately: n }) },
        { key: 'quiet', title: 'Quiet night', body: 'Send a one-line “all clear” when nothing is found.', on: quietNightAllClear, patch: (n: boolean) => ({ quietNight: n ? 'all_clear' : 'nothing' }) },
      ].map((s) => (
        <div key={s.key} style={rowStyle}>
          <div style={{ flex: '1 1 240px' }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>{s.title}</div>
            <div style={{ fontSize: 12.5, color: '#A3AEC2', marginTop: 3, lineHeight: 1.4 }}>{s.body}</div>
          </div>
          <Switch
            on={s.on}
            label={s.title}
            accent={accent}
            disabled={readOnly}
            busy={busy !== ''}
            onChange={(next) => {
              void save(s.key, s.patch(next));
            }}
          />
          <div style={{ flex: '1 1 100%' }}>{note(s.key)}</div>
        </div>
      ))}
      {[
        { label: 'WhatsApp', why: 'It needs a messaging provider, and none is connected.' },
        { label: 'Push', why: 'It needs a mobile app or a push provider, and there is none yet.' },
      ].map((c) => (
        <div key={c.label} style={rowStyle}>
          <div style={{ flex: '1 1 240px' }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: '#A3AEC2' }}>{c.label}</div>
            <div style={{ fontSize: 12.5, color: '#8E9BB2', marginTop: 3 }}>{c.why}</div>
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#B4BFD2', background: 'rgba(142,155,178,0.2)', padding: '6px 12px', borderRadius: 99 }}>Not available yet</span>
        </div>
      ))}
    </div>
  );
}
