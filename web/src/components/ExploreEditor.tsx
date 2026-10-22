'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { css } from '@/lib/dc';
import { PERSONA_IDS, PERSONA_INFO, type Persona } from '@/lib/explore';
import { useSettingsSave } from './useSettingsSave';

const ACCENT = '#34E3CB';
const CARD =
  'background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.016));border:1px solid rgba(255,255,255,0.085);border-radius:22px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 28px 56px -30px rgba(0,0,0,0.9)';

function Switch({ on, color, label, disabled, onToggle }: { on: boolean; color: string; label: string; disabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      style={css(`width: 52px; height: 44px; border: 0; background: transparent; padding: 0; display: flex; align-items: center; justify-content: flex-end; cursor: ${disabled ? 'not-allowed' : 'pointer'}`)}
    >
      <span style={css(`width: 48px; height: 26px; border-radius: 99px; position: relative; display: block; background: ${on ? color : '#2D384B'}`)}>
        <span style={css(`position: absolute; top: 3px; width: 20px; height: 20px; border-radius: 50%; background: #FFFFFF; ${on ? 'right: 3px' : 'left: 3px'}`)} />
      </span>
    </button>
  );
}

/** Exploration on or off, which personas run, and how many steps one session may take. */
export function ExploreEditor({
  enabled: enabled0,
  personas: personas0,
  maxSteps: steps0,
  found,
  readOnly,
}: {
  enabled: boolean;
  personas: readonly Persona[];
  maxSteps: number;
  /** Findings this week per persona. */
  found: Readonly<Record<string, number>>;
  readOnly: boolean;
}) {
  const { busy, error, saved, save } = useSettingsSave('exploration');
  const [enabled, setEnabled] = useState(enabled0);
  const [personas, setPersonas] = useState<readonly Persona[]>(personas0);
  const [steps, setSteps] = useState(steps0);
  const disabled = readOnly || busy;

  return (
    <>
      <section aria-label="Personas" style={css('display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px')}>
        {PERSONA_IDS.map((id) => {
          const p = PERSONA_INFO[id];
          const on = personas.includes(id);
          const n = found[id] ?? 0;
          return (
            <div
              key={id}
              style={css(
                `padding: 20px 20px 18px; border-radius: 22px; border: 1px solid ${on ? `${p.color}66` : 'rgba(255,255,255,0.09)'}; background: linear-gradient(180deg, ${on ? `${p.color}1A` : 'rgba(255,255,255,0.04)'}, rgba(255,255,255,0.012)); box-shadow: ${on ? `0 0 46px -18px ${p.color}99, ` : ''}inset 0 1px 0 rgba(255,255,255,0.07); ${on ? '' : 'opacity: 0.75'}`,
              )}
            >
              <div style={css('display: flex; justify-content: space-between; align-items: flex-start')}>
                <div style={css(`width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 800; color: #070A10; background: radial-gradient(circle at 32% 28%, #FFFFFF66, ${p.color} 55%); box-shadow: 0 0 28px ${p.color}88`)}>{p.glyph}</div>
                <Switch
                  on={on}
                  color={p.color}
                  disabled={disabled}
                  label={`${p.name} is ${on ? 'on' : 'off'}`}
                  onToggle={() => {
                    setPersonas(on ? personas.filter((x) => x !== id) : [...personas, id]);
                  }}
                />
              </div>
              <div style={css('font-size: 17px; font-weight: 800; margin-top: 16px; letter-spacing: -0.3px')}>{p.name}</div>
              <div style={css('font-size: 13px; color: #A3AEC2; margin-top: 6px; line-height: 1.5')}>{p.text}</div>
              <div style={css(`margin-top: 16px; display: inline-block; font-size: 12px; font-weight: 800; padding: 5px 11px; border-radius: 99px; background: rgba(255,255,255,0.07); color: ${n > 0 ? p.color : '#8E9BB2'}`)}>
                {n > 0 ? `${String(n)} ${n === 1 ? 'bug' : 'bugs'} this week` : 'No bugs this week'}
              </div>
            </div>
          );
        })}
      </section>

      <section style={css(`${CARD}; padding: 22px 28px; display: flex; flex-wrap: wrap; align-items: center; gap: 18px 36px`)}>
        <div style={css('display: flex; align-items: center; gap: 6px')}>
          <Switch
            on={enabled}
            color={ACCENT}
            disabled={disabled}
            label={`Exploration is ${enabled ? 'on' : 'off'}`}
            onToggle={() => {
              setEnabled(!enabled);
            }}
          />
          <div>
            <div style={css('font-size: 16px; font-weight: 800')}>Exploration is {enabled ? 'on' : 'off'}</div>
            <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 2px')}>Nothing explores while this is off, including Explore now.</div>
          </div>
        </div>
        <label style={css('flex: 1 1 280px; display: block')}>
          <span style={css('display: flex; justify-content: space-between; font-size: 13.5px; font-weight: 700')}>
            <span>Steps per session</span>
            <span style={css(`font-family: 'JetBrains Mono', monospace; color: ${ACCENT}`)}>{steps}</span>
          </span>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={steps}
            disabled={disabled}
            aria-label="Steps per exploration session"
            onChange={(e) => {
              setSteps(Number(e.target.value));
            }}
            style={css(`width: 100%; margin-top: 10px; accent-color: ${ACCENT}; min-height: 28px`)}
          />
        </label>
        <div style={css('display: flex; flex-wrap: wrap; align-items: center; gap: 12px')}>
          <button
            type="button"
            disabled={disabled}
            title={readOnly ? 'View-only account: you cannot change this' : undefined}
            onClick={() => void save({ enabled, personas, maxSteps: steps })}
            style={css(`min-height: 50px; padding: 0 26px; border: 0; border-radius: 14px; background: ${ACCENT}; color: #03211D; font-family: inherit; font-size: 15px; font-weight: 800; cursor: ${disabled ? 'not-allowed' : 'pointer'}; opacity: ${disabled ? 0.5 : 1}`)}
          >
            {busy ? 'Saving…' : 'Save exploration'}
          </button>
          {saved ? <span role="status" style={css('font-size: 13px; color: #34E3CB')}>Saved.</span> : null}
          {error ? (
            <span role="alert" style={css('font-size: 13px; color: #FF8A7B')}>
              {error}
            </span>
          ) : null}
        </div>
      </section>
    </>
  );
}

/** Starts one exploration run as the chosen persona and opens it. */
export function ExploreNow({ personas, blockedReason, readOnly }: { personas: readonly Persona[]; blockedReason?: string; readOnly: boolean }) {
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | undefined>(personas[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const off = readOnly || busy || !persona || blockedReason !== undefined;
  async function start() {
    if (!persona) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'explore', persona }) });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) throw new Error(json.error ?? 'Could not start exploring.');
      router.push(`/runs/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start exploring.');
      setBusy(false);
    }
  }
  return (
    <div style={css('display: flex; flex-direction: column; align-items: flex-end; gap: 8px')}>
      <div style={css('display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end')}>
        {personas.length > 1 ? (
          <select
            aria-label="Persona to explore as"
            value={persona}
            disabled={off && !persona}
            onChange={(e) => {
              setPersona(personas.find((p) => p === e.target.value));
            }}
            style={css('min-height: 50px; box-sizing: border-box; padding: 0 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.2); background: #0B1019; color: #EAF0FA; font-family: inherit; font-size: 14px')}
          >
            {personas.map((p) => (
              <option key={p} value={p}>
                {PERSONA_INFO[p].name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          disabled={off}
          title={readOnly ? 'View-only account: you cannot start runs' : blockedReason}
          onClick={() => void start()}
          style={css(`min-height: 50px; padding: 0 26px; border: 0; border-radius: 14px; background: ${ACCENT}; color: #03211D; font-family: inherit; font-size: 15px; font-weight: 800; cursor: ${off ? 'not-allowed' : 'pointer'}; opacity: ${off ? 0.45 : 1}; box-shadow: ${off ? 'none' : '0 10px 36px -8px rgba(52,227,203,0.7)'}`)}
        >
          {busy ? 'Starting…' : 'Explore now'}
        </button>
      </div>
      {blockedReason && !readOnly ? <div style={css('font-size: 12.5px; color: #8E9BB2; max-width: 320px; text-align: right')}>{blockedReason}</div> : null}
      {error ? (
        <p role="alert" style={css('margin: 0; font-size: 13px; color: #FF8A7B; max-width: 320px; text-align: right')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
