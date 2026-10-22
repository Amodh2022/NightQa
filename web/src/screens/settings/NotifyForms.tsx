'use client';

import { useState } from 'react';
import { ActionButton, Field, Result, disabledIf, inputStyle, secondaryBtn, useSend } from './fields';

/** One notification secret (a Slack, SMTP or webhook address). Stored encrypted; the saved value is never shown. */
export function NotifyField({ name, label, placeholder, saved, readOnly }: { name: string; label: string; placeholder: string; saved: boolean; readOnly: boolean }) {
  const [value, setValue] = useState('');
  const { send, busy, outcome } = useSend();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send('/api/settings/notify', 'POST', { name, value }, 'Saved.').then((ok) => {
          if (ok) setValue('');
        });
      }}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}
    >
      <Field id={`n-${name}`} label={saved ? `${label} (saved, enter a new one to replace)` : label} grow="1 1 260px">
        <input id={`n-${name}`} type="password" value={value} readOnly={readOnly} autoComplete="off" placeholder={saved ? 'Saved' : placeholder} onChange={(e) => { setValue(e.target.value); }} style={inputStyle()} />
      </Field>
      {readOnly ? null : (
        <>
          <button type="submit" disabled={busy || !value} style={{ ...secondaryBtn, ...disabledIf(busy || !value) }}>{busy ? 'Saving...' : 'Save'}</button>
          {saved ? <ActionButton url="/api/settings/notify" method="DELETE" body={{ name }} label="Remove" okText="Removed." danger confirmText="Remove this saved address?" /> : null}
        </>
      )}
      <div style={{ flexBasis: '100%' }}><Result outcome={outcome} /></div>
    </form>
  );
}

export function RecipientsForm({ to, readOnly }: { to: readonly string[]; readOnly: boolean }) {
  const [v, setV] = useState(to.join(', '));
  const { send, busy, outcome } = useSend();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send('/api/settings/recipients', 'POST', { to: v.split(',').map((s) => s.trim()).filter(Boolean) }, 'Saved.');
      }}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}
    >
      <Field id="rcpt" label="Send the report to (comma separated)" grow="1 1 260px">
        <input id="rcpt" value={v} readOnly={readOnly} placeholder="arjun@shopkart.example, meera@shopkart.example" onChange={(e) => { setV(e.target.value); }} style={inputStyle()} />
      </Field>
      {readOnly ? null : <button type="submit" disabled={busy} style={{ ...secondaryBtn, ...disabledIf(busy) }}>{busy ? 'Saving...' : 'Save'}</button>}
      <div style={{ flexBasis: '100%' }}><Result outcome={outcome} /></div>
    </form>
  );
}
