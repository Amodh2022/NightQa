'use client';

import { useState } from 'react';
import { RunFlowButtons, type FlowChoice } from './RunFlowButtons';

/** The "Run now" button: opens a panel to choose which flow to run, with the AI or as a free replay. */
export function RunNowMenu({ flows, accent = '#34E3CB', large = true }: { flows: readonly FlowChoice[]; accent?: string; large?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="run-now-panel"
        onClick={() => {
          setOpen((o) => !o);
        }}
        style={{
          minHeight: large ? 50 : 44,
          padding: large ? '0 26px' : '0 20px',
          border: 0,
          borderRadius: 14,
          background: accent,
          color: '#03211D',
          fontFamily: 'inherit',
          fontSize: 15,
          fontWeight: 800,
          boxShadow: '0 10px 36px -8px rgba(52,227,203,0.7)',
          cursor: 'pointer',
        }}
      >
        Run now
      </button>
      {open ? (
        <div
          id="run-now-panel"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            zIndex: 20,
            width: 'min(460px, 92vw)',
            maxHeight: '70vh',
            overflowY: 'auto',
            padding: 16,
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.14)',
            background: '#0B1019',
            boxShadow: '0 30px 70px -20px rgba(0,0,0,0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: '#A3AEC2' }}>Choose a flow</div>
          {flows.length === 0 ? <p style={{ margin: 0, fontSize: 14, color: '#A3AEC2' }}>No flow files found in flows/.</p> : null}
          {flows.map((f) => (
            <div key={f.file} style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>{f.name}</div>
              <RunFlowButtons flow={f} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
