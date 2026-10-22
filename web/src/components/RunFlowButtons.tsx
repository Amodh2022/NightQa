'use client';

import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';

const base: CSSProperties = {
  minHeight: 44,
  padding: '0 16px',
  borderRadius: 12,
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  cursor: 'pointer',
};
const primary: CSSProperties = { ...base, border: 0, background: '#34E3CB', color: '#03211D', fontWeight: 800 };
const secondary: CSSProperties = { ...base, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.05)', color: '#EAF0FA' };
const disabled: CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };

export interface FlowChoice {
  readonly file: string;
  readonly name: string;
  readonly hasSavedTest: boolean;
}

/** Starts a run through the dashboard API and opens it. Errors stay on the button, in words. */
export function useStartRun() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function start(flowFile: string, mode: 'run' | 'replay') {
    setBusy(`${flowFile}:${mode}`);
    setError(null);
    try {
      const res = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ flowFile, mode }) });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? 'Could not start the run.');
      router.push(`/runs/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the run.');
      setBusy(null);
    }
  }
  return { busy, error, start };
}

/** Two buttons for one flow: run with the AI, or replay the saved test (no AI, free). */
export function RunFlowButtons({ flow, readOnly = false }: { flow: FlowChoice; readOnly?: boolean }) {
  const { busy, error, start } = useStartRun();
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{ ...primary, ...(busy || readOnly ? disabled : {}) }}
          disabled={busy !== null || readOnly}
          title={readOnly ? 'View-only account: you cannot start runs' : undefined}
          onClick={() => void start(flow.file, 'run')}>
          {busy === `${flow.file}:run` ? 'Starting…' : 'Run with AI'}
        </button>
        <button
          type="button"
          style={{ ...secondary, ...(busy || readOnly || !flow.hasSavedTest ? disabled : {}) }}
          disabled={busy !== null || readOnly || !flow.hasSavedTest}
          title={readOnly ? 'View-only account: you cannot start runs' : flow.hasSavedTest ? 'Replay the saved test with no AI calls' : 'Run it with the AI once and let it pass to save a test'}
          onClick={() => void start(flow.file, 'replay')}
        >
          {busy === `${flow.file}:replay` ? 'Starting…' : 'Replay, no AI'}
        </button>
      </div>
      {error ? (
        <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: '#FF8A7B' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
