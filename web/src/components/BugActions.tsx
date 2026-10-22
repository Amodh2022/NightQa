'use client';

import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';
import { CLOSE_REASONS, type CloseReason } from '@/lib/bug-reasons';

const BTN: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(255,255,255,0.04)',
  color: '#EAF0FA',
  fontFamily: 'inherit',
  fontWeight: 700,
  cursor: 'pointer',
};

/** Wrong fix / Not a bug / Won't fix. Records the reason on the bug; it does not touch GitHub. */
export function CloseReasons({ run, id, current, compact = false }: { run: string; id: string; current?: CloseReason | undefined; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<CloseReason | undefined>(undefined);
  const [error, setError] = useState('');

  async function choose(reason: CloseReason): Promise<void> {
    setBusy(reason);
    setError('');
    try {
      const res = await fetch(`/api/bugs/${encodeURIComponent(run)}/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ closeReason: reason }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: unknown } | null;
        setError(typeof j?.error === 'string' ? j.error : 'Could not save that.');
      } else router.refresh();
    } catch {
      setError('Could not reach the dashboard.');
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: compact ? 'nowrap' : 'wrap' }}>
        {CLOSE_REASONS.map((r) => {
          const on = current === r.value;
          return (
            <button
              key={r.value}
              type="button"
              disabled={busy !== undefined}
              aria-pressed={on}
              onClick={() => {
                void choose(r.value);
              }}
              style={{
                ...BTN,
                ...(compact ? { flex: 1, minHeight: 46, borderRadius: 13, fontSize: 13 } : { minHeight: 44, padding: '0 16px', fontSize: 13.5 }),
                ...(on ? { borderColor: '#34E3CB', background: 'rgba(52,227,203,0.13)', color: '#34E3CB' } : {}),
                opacity: busy !== undefined && busy !== r.value ? 0.6 : 1,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: '#FF8A7B' }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

/** Shows text to paste on GitHub with a copy button. The dashboard never posts it itself. */
export function CopyComment({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <pre
        style={{
          margin: 0,
          padding: '12px 14px',
          background: '#05080D',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12.5,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          color: '#C7D0E0',
        }}
      >
        {text}
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(
            () => {
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
              }, 2000);
            },
            () => undefined,
          );
        }}
        style={{ ...BTN, minHeight: 44, padding: '0 16px', fontSize: 13.5, marginTop: 10 }}
      >
        {copied ? 'Copied' : 'Copy comment'}
      </button>
    </div>
  );
}
