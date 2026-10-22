'use client';

import { useRouter } from 'next/navigation';
import { useState, type CSSProperties, type ReactNode } from 'react';

export const ACCENT = '#34E3CB';
export const FONT = "'Manrope', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', monospace";

export const inputStyle = (mono = true): CSSProperties => ({
  minHeight: 48, boxSizing: 'border-box', padding: '0 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)',
  background: '#05080D', color: '#EAF0FA', fontFamily: mono ? MONO : 'inherit', fontSize: 14, width: '100%',
});
export const labelStyle: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: '#A3AEC2' };
const btn: CSSProperties = { minHeight: 46, padding: '0 18px', borderRadius: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
export const secondaryBtn: CSSProperties = { ...btn, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.05)', color: '#EAF0FA' };
export const primaryBtn: CSSProperties = { ...btn, border: 0, background: ACCENT, color: '#03211D', fontWeight: 800 };
export const dangerBtn: CSSProperties = { ...btn, border: '1px solid rgba(255,107,91,0.6)', background: 'rgba(255,107,91,0.08)', color: '#FF8A7B', fontWeight: 800 };
const off: CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };

export interface Outcome {
  readonly ok: boolean;
  readonly message: string;
}

/** Sends JSON to a settings route, refreshes the server data on success, and keeps the answer as words. */
export function useSend() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  async function send(url: string, method: 'POST' | 'DELETE', body: unknown, okText: string): Promise<boolean> {
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string; connected?: boolean; deleted?: number };
      if (!res.ok) {
        setOutcome({ ok: false, message: json.error ?? 'That did not work.' });
        return false;
      }
      setOutcome({ ok: json.connected !== false, message: json.message ?? okText });
      router.refresh();
      return true;
    } catch {
      setOutcome({ ok: false, message: 'Could not reach the dashboard.' });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { send, busy, outcome, setOutcome };
}

export function Field({ id, label, children, grow = '1 1 220px' }: { id: string; label: string; children: ReactNode; grow?: string }) {
  return (
    <div style={{ flex: grow, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export function Result({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null;
  return (
    <div role="status" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.45, color: outcome.ok ? ACCENT : '#FF8A7B' }}>
      {outcome.message}
    </div>
  );
}

export const disabledIf = (flag: boolean): CSSProperties => (flag ? off : {});

/** A single button that calls a route (test connection, remove, disconnect). */
export function ActionButton({ url, method = 'POST', body = {}, label, busyLabel, okText, danger = false, confirmText, readOnly = false }: {
  url: string; method?: 'POST' | 'DELETE'; body?: unknown; label: string; busyLabel?: string; okText: string; danger?: boolean; confirmText?: string; readOnly?: boolean;
}) {
  const { send, busy, outcome } = useSend();
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <button
        type="button"
        disabled={busy || readOnly}
        title={readOnly ? 'View-only account' : undefined}
        style={{ ...(danger ? dangerBtn : secondaryBtn), ...disabledIf(busy || readOnly) }}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          void send(url, method, body, okText);
        }}
      >
        {busy ? (busyLabel ?? 'Working...') : label}
      </button>
      <Result outcome={outcome} />
    </span>
  );
}
