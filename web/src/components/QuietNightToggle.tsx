'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Switch } from './Switch';

/** The "Quiet night" switch on the mobile alerts screen: sends a one-line all-clear when nothing is found. */
export function QuietNightToggle({ on, readOnly, accent }: { on: boolean; readOnly: boolean; accent: string }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = async (next: boolean): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/settings/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quietNight: next ? 'all_clear' : 'nothing' }) });
      if (res.ok) {
        setValue(next);
        router.refresh();
      } else setError('Could not save.');
    } catch {
      setError('Could not save.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <Switch
        on={value}
        label="Quiet night all clear"
        accent={accent}
        disabled={readOnly}
        busy={busy}
        onChange={(n) => {
          void change(n);
        }}
      />
      {error ? <span role="alert" style={{ fontSize: 11, color: '#FF8A7B' }}>{error}</span> : null}
    </div>
  );
}
