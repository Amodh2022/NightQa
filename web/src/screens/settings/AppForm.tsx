'use client';

import { useState } from 'react';
import { Field, Result, disabledIf, inputStyle, primaryBtn, useSend } from './fields';

/** App name and staging URL. The staging-rule feedback for the saved value is shown by the page; errors show here. */
export function AppForm({ name, targetUrl, readOnly }: { name: string; targetUrl: string; readOnly: boolean }) {
  const [n, setN] = useState(name);
  const [u, setU] = useState(targetUrl);
  const [confirm, setConfirm] = useState(false);
  const { send, busy, outcome } = useSend();
  const needsConfirm = outcome?.ok === false && outcome.message.includes('looks like production');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send('/api/settings/app', 'POST', { name: n, targetUrl: u, confirmProduction: confirm }, 'Saved.');
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <Field id="url" label="Staging URL" grow="1 1 280px">
          <input id="url" value={u} readOnly={readOnly} placeholder="https://staging.yourapp.example" onChange={(e) => { setU(e.target.value); }} style={inputStyle()} />
        </Field>
        <Field id="appname" label="App name" grow="1 1 200px">
          <input id="appname" value={n} readOnly={readOnly} onChange={(e) => { setN(e.target.value); }} style={inputStyle(false)} />
        </Field>
      </div>
      {needsConfirm ? (
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#FFC14D', fontWeight: 700 }}>
          <input type="checkbox" checked={confirm} onChange={(e) => { setConfirm(e.target.checked); }} /> I confirm this is a staging environment.
        </label>
      ) : null}
      {readOnly ? null : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, ...disabledIf(busy) }}>{busy ? 'Saving...' : 'Save'}</button>
          <Result outcome={outcome} />
        </div>
      )}
    </form>
  );
}
