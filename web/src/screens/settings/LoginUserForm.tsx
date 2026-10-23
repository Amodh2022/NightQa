'use client';

import { useState } from 'react';
import { Field, Result, disabledIf, inputStyle, primaryBtn, useSend } from './fields';

/** Adds an email + password account for someone. The password is sent once, hashed on the server and never shown again. */
export function LoginUserForm() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [role, setRole] = useState<'member' | 'viewer'>('viewer');
  const { send, busy, outcome } = useSend();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send('/api/settings/users', 'POST', { email, password: pw, role }, `Added ${email}. Share the password with them privately.`).then((saved) => {
          if (saved) {
            setEmail('');
            setPw('');
          }
        });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <Field id="user-email" label="Email" grow="1 1 240px">
          <input id="user-email" type="email" required value={email} autoComplete="off" onChange={(e) => { setEmail(e.target.value); }} style={inputStyle(false)} />
        </Field>
        <Field id="user-pw" label="Password (12+ characters)" grow="1 1 220px">
          <input id="user-pw" type="password" required minLength={12} value={pw} autoComplete="new-password" onChange={(e) => { setPw(e.target.value); }} style={{ ...inputStyle(false), fontFamily: 'inherit' }} />
        </Field>
        <Field id="user-role" label="Can" grow="0 1 180px">
          <select id="user-role" value={role} onChange={(e) => { setRole(e.target.value === 'member' ? 'member' : 'viewer'); }} style={inputStyle(false)}>
            <option value="viewer">Only look</option>
            <option value="member">Run things and change settings</option>
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="submit" disabled={busy} style={{ ...primaryBtn, ...disabledIf(busy) }}>{busy ? 'Adding...' : 'Add person'}</button>
        <Result outcome={outcome} />
      </div>
    </form>
  );
}
