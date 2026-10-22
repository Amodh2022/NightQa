'use client';

import { useState } from 'react';
import { ActionButton, Field, Result, disabledIf, inputStyle, primaryBtn, useSend } from './fields';

/** GitHub repo and token. The token goes to the encrypted vault and is never shown again; testing happens on the server. */
export function GithubForm({ repo, hasToken, readOnly }: { repo: string; hasToken: boolean; readOnly: boolean }) {
  const [r, setR] = useState(repo);
  const [token, setToken] = useState('');
  const { send, busy, outcome } = useSend();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send('/api/settings/github', 'POST', token ? { repo: r, token } : { repo: r }, 'Saved. Now test the connection.').then((saved) => {
            if (saved) setToken('');
          });
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <Field id="gh-repo" label="Repository (owner/name)" grow="1 1 240px">
            <input id="gh-repo" value={r} readOnly={readOnly} placeholder="shopkart/web" onChange={(e) => { setR(e.target.value); }} style={inputStyle()} />
          </Field>
          <Field id="gh-token" label={hasToken ? 'Token (saved, leave blank to keep)' : 'Fine-grained token'} grow="1 1 240px">
            <input id="gh-token" type="password" value={token} readOnly={readOnly} autoComplete="new-password" placeholder={hasToken ? 'Saved' : 'github_pat_...'} onChange={(e) => { setToken(e.target.value); }} style={inputStyle()} />
          </Field>
        </div>
        <div style={{ fontSize: 12.5, color: '#8E9BB2', lineHeight: 1.5 }}>
          Create a fine-grained token limited to this one repository with Issues: read and write. Nothing else is needed; code access stays off.
        </div>
        {readOnly ? null : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, ...disabledIf(busy) }}>{busy ? 'Saving...' : 'Save'}</button>
            <ActionButton url="/api/settings/github/test" label="Test connection" busyLabel="Testing..." okText="Connected." readOnly={!hasToken || !repo} />
            {hasToken ? <ActionButton url="/api/settings/github" method="DELETE" label="Remove token" okText="Token removed." danger confirmText="Remove the saved GitHub token?" /> : null}
            <Result outcome={outcome} />
          </div>
        )}
      </form>
    </div>
  );
}
