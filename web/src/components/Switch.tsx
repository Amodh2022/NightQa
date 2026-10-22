'use client';

/** The design's on/off switch (52 x 30 track inside a 44 px tall tap target). */
export function Switch({ on, onChange, label, disabled = false, accent = '#34E3CB', busy = false }: { on: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; accent?: string; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled || busy}
      title={disabled ? 'View-only account: you cannot change this' : undefined}
      onClick={() => {
        onChange(!on);
      }}
      style={{ width: 56, height: 44, border: 0, background: 'transparent', padding: 0, display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled || busy ? 0.5 : 1, flex: '0 0 auto' }}
    >
      <span style={{ width: 52, height: 30, borderRadius: 99, background: on ? accent : 'rgba(255,255,255,0.16)', position: 'relative', display: 'block', boxShadow: on ? '0 0 18px rgba(52,227,203,0.5)' : 'none' }}>
        <span style={{ position: 'absolute', [on ? 'right' : 'left']: 4, top: 4, width: 22, height: 22, borderRadius: '50%', background: on ? '#03211D' : '#EAF0FA' }} />
      </span>
    </button>
  );
}
