'use client';

import { useState } from 'react';
import { Field, Result, disabledIf, inputStyle, primaryBtn, useSend } from './fields';

/**
 * Saves a test account into the encrypted vault. The values are sent once and cleared from the form;
 * the dashboard never shows them again.
 */
export function AccountForm({ readOnly, large = false, onSaved }: { readOnly: boolean; large?: boolean; onSaved?: () => void }) {
  const [name, setName] = useState('');
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const { send, busy, outcome } = useSend();
  const style = large ? { ...inputStyle(), minHeight: 52, borderRadius: 14, fontSize: 15 } : inputStyle();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send('/api/settings/accounts', 'POST', { name, username: user, password: pw }, `Saved "${name}". The password is encrypted and cannot be shown again.`).then((saved) => {
          if (saved) {
            setPw('');
            setUser('');
            setName('');
            onSaved?.();
          }
        });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <Field id="acct" label="Account name">
          <input id="acct" required value={name} readOnly={readOnly} placeholder="test-buyer" autoComplete="off" onChange={(e) => { setName(e.target.value); }} style={style} />
        </Field>
        <Field id="acct-user" label="Login email or username">
          <input id="acct-user" required value={user} readOnly={readOnly} autoComplete="off" onChange={(e) => { setUser(e.target.value); }} style={style} />
        </Field>
        <Field id="acct-pw" label="Password">
          <input id="acct-pw" required type="password" value={pw} readOnly={readOnly} autoComplete="new-password" onChange={(e) => { setPw(e.target.value); }} style={{ ...style, fontFamily: 'inherit' }} />
        </Field>
      </div>
      {readOnly ? null : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, ...(large ? { minHeight: 54, padding: '0 32px', borderRadius: 16, fontSize: 16 } : {}), ...disabledIf(busy) }}>
            {busy ? 'Saving...' : large ? 'Save account' : 'Add test account'}
          </button>
          <Result outcome={outcome} />
        </div>
      )}
    </form>
  );
}
