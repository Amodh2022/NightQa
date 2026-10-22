'use client';

import { useState } from 'react';
import { Field, Result, dangerBtn, disabledIf, inputStyle, secondaryBtn, useSend } from './fields';

/** Evidence retention (days) and the typed-confirmation delete of run folders older than that. */
export function RetentionForm({ days, expiredCount, readOnly }: { days: number; expiredCount: number; readOnly: boolean }) {
  const [d, setD] = useState(String(days));
  const [typed, setTyped] = useState('');
  const save = useSend();
  const del = useSend();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save.send('/api/settings/retention', 'POST', { days: Number(d) }, 'Saved.');
        }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}
      >
        <Field id="ret" label="Keep evidence for (days)" grow="0 1 220px">
          <input id="ret" type="number" min={1} max={3650} value={d} readOnly={readOnly} onChange={(e) => { setD(e.target.value); }} style={inputStyle(false)} />
        </Field>
        {readOnly ? null : <button type="submit" disabled={save.busy} style={{ ...secondaryBtn, ...disabledIf(save.busy) }}>{save.busy ? 'Saving...' : 'Save'}</button>}
        <Result outcome={save.outcome} />
      </form>
      {readOnly ? null : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void del.send('/api/settings/evidence', 'POST', { confirm: typed }, 'Deleted.').then((ok) => {
              if (ok) setTyped('');
            });
          }}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}
        >
          <Field id="del" label={`Delete evidence older than ${String(days)} days (${String(expiredCount)} run folder${expiredCount === 1 ? '' : 's'} now). Type DELETE to confirm.`} grow="1 1 260px">
            <input id="del" value={typed} autoComplete="off" onChange={(e) => { setTyped(e.target.value); }} style={inputStyle()} />
          </Field>
          <button type="submit" disabled={del.busy || typed !== 'DELETE'} style={{ ...dangerBtn, ...disabledIf(del.busy || typed !== 'DELETE') }}>{del.busy ? 'Deleting...' : 'Delete evidence'}</button>
          <div style={{ flexBasis: '100%' }}><Result outcome={del.outcome} /></div>
        </form>
      )}
    </div>
  );
}
