'use client';

import { useState } from 'react';
import { css } from '@/lib/dc';
import { useSettingsSave } from './useSettingsSave';

type Level = 'L0' | 'L1' | 'L2';
const ACCENT = '#34E3CB';
const MONO = "'JetBrains Mono', monospace";

const LEVELS: readonly { id: string; name: string; desc: string; h: number; selectable: boolean }[] = [
  { id: 'L0', name: 'Report', desc: 'Proven bugs in your morning report.', h: 150, selectable: true },
  { id: 'L1', name: 'Issue', desc: 'A failing test and a GitHub issue.', h: 185, selectable: true },
  { id: 'L2', name: 'Fix PR', desc: 'Your coding agent proposes a fix. You merge it.', h: 225, selectable: true },
  { id: 'L3', name: 'Auto-merge', desc: 'Not available: nothing merges without a human.', h: 262, selectable: false },
  { id: 'L4', name: 'Auto-deploy', desc: 'Not available. NightQA never deploys for you.', h: 296, selectable: false },
  { id: 'L5', name: 'Production', desc: 'Not available. NightQA never touches production.', h: 330, selectable: false },
];

const tag = (fg: string, bg: string): string => `font-size:11px;font-weight:800;color:${fg};background:${bg};padding:4px 9px;border-radius:99px`;

function stepStyle(h: number, state: 'now' | 'on' | 'off' | 'na'): string {
  const base = `box-sizing:border-box;width:100%;text-align:left;font-family:inherit;color:inherit;cursor:${state === 'na' ? 'default' : 'pointer'};height:${String(h)}px;padding:18px 18px 16px;border-radius:20px;`;
  if (state === 'now') return `${base}border:1px solid ${ACCENT};background:linear-gradient(180deg,rgba(52,227,203,0.22),rgba(52,227,203,0.05));box-shadow:0 0 60px -10px rgba(52,227,203,0.65),inset 0 1px 0 rgba(255,255,255,0.12)`;
  if (state === 'on') return `${base}border:1px solid rgba(52,227,203,0.35);background:linear-gradient(180deg,rgba(52,227,203,0.11),rgba(52,227,203,0.02))`;
  if (state === 'off') return `${base}border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.03)`;
  return `${base}border:1px dashed rgba(255,255,255,0.2);background:rgba(255,255,255,0.02);opacity:0.8`;
}

/** The ladder. L0 to L2 can be chosen; L3 and above are shown but cannot be switched on. */
export function LevelLadder({ level, readOnly }: { level: Level; readOnly: boolean }) {
  const { busy, error, save } = useSettingsSave('autonomy');
  const current = Number(level.slice(1));
  return (
    <div>
      <div style={css('display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; align-items: end')}>
        {LEVELS.map((l, i) => {
          const state = !l.selectable ? 'na' : i === current ? 'now' : i < current ? 'on' : 'off';
          const stateText = state === 'now' ? 'Current' : state === 'on' ? 'On' : state === 'off' ? 'Off' : 'Not available';
          const t = state === 'now' ? tag('#03211D', ACCENT) : state === 'on' ? tag(ACCENT, 'rgba(52,227,203,0.15)') : tag('#A3AEC2', 'rgba(255,255,255,0.08)');
          const inner = (
            <>
              <div style={css('display: flex; justify-content: space-between; align-items: center; gap: 6px')}>
                <span style={css(`font-family: ${MONO}; font-size: 13px; font-weight: 500; color: #C7D0E0`)}>{l.id}</span>
                <span style={css(t)}>{stateText}</span>
              </div>
              <div style={css('font-size: 18px; font-weight: 800; margin-top: 12px; letter-spacing: -0.4px')}>{l.name}</div>
              <div style={css('font-size: 13px; color: #B4BFD2; margin-top: 8px; line-height: 1.5')}>{l.desc}</div>
            </>
          );
          return (
            <div key={l.id} style={css('display: flex; flex-direction: column; justify-content: flex-end; min-height: 330px')}>
              {state === 'now' ? (
                <div style={css(`align-self: flex-start; margin-bottom: 12px; font-size: 12px; font-weight: 800; color: #03211D; background: ${ACCENT}; padding: 5px 12px; border-radius: 99px; box-shadow: 0 0 26px rgba(52,227,203,0.7)`)}>You are here</div>
              ) : null}
              {l.selectable ? (
                <button
                  type="button"
                  aria-pressed={state === 'now'}
                  disabled={readOnly || busy}
                  title={readOnly ? 'View-only account: you cannot change this' : undefined}
                  onClick={() => void save({ level: l.id })}
                  style={css(`${stepStyle(l.h, state)}${readOnly ? ';cursor: not-allowed' : ''}`)}
                >
                  {inner}
                </button>
              ) : (
                <div aria-disabled="true" style={css(stepStyle(l.h, 'na'))}>
                  {inner}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" style={css('margin: 14px 0 0; font-size: 13px; color: #FF8A7B')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Pause all / Resume. While paused, the dashboard refuses to start runs. */
export function PauseButton({ paused, readOnly }: { paused: boolean; readOnly: boolean }) {
  const { busy, error, save } = useSettingsSave('autonomy');
  return (
    <div style={css('display: flex; flex-direction: column; align-items: flex-end; gap: 8px')}>
      <button
        type="button"
        disabled={readOnly || busy}
        title={readOnly ? 'View-only account: you cannot change this' : undefined}
        onClick={() => void save({ paused: !paused })}
        style={css(
          paused
            ? `min-height: 52px; padding: 0 24px; border: 0; border-radius: 14px; background: ${ACCENT}; color: #03211D; font-family: inherit; font-size: 15px; font-weight: 800; cursor: pointer; box-shadow: 0 10px 36px -8px rgba(52,227,203,0.7)`
            : 'min-height: 52px; padding: 0 24px; border: 1px solid rgba(255,107,91,0.65); border-radius: 14px; background: rgba(255,107,91,0.1); color: #FF8A7B; font-family: inherit; font-size: 15px; font-weight: 800; cursor: pointer; box-shadow: 0 0 36px -12px rgba(255,107,91,0.6)',
        )}
      >
        {busy ? 'Saving…' : paused ? 'Resume NightQA' : 'Pause all autonomy'}
      </button>
      {error ? (
        <p role="alert" style={css('margin: 0; font-size: 13px; color: #FF8A7B')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** An editable list of blocked pages or actions: add a line, or remove one. */
export function ListEditor({ field, items, readOnly, addLabel, placeholder }: { field: 'blockedPaths' | 'blockedActions'; items: readonly string[]; readOnly: boolean; addLabel: string; placeholder: string }) {
  const { busy, error, save } = useSettingsSave('autonomy');
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  async function add() {
    const v = text.trim();
    if (!v) return;
    if (await save({ [field]: [...items, v] })) {
      setText('');
      setAdding(false);
    }
  }
  return (
    <div>
      <div style={css('display: flex; gap: 8px; flex-wrap: wrap')}>
        {items.length === 0 ? <span style={css('font-size: 13px; color: #8E9BB2; align-self: center')}>None yet.</span> : null}
        {items.map((p) => (
          <span key={p} style={css(`display: inline-flex; align-items: center; gap: 8px; font-family: ${MONO}; font-size: 12.5px; font-weight: 500; color: #FF8A7B; background: rgba(255,107,91,0.12); border: 1px solid rgba(255,107,91,0.4); padding: 7px 8px 7px 13px; border-radius: 10px`)}>
            {p}
            {readOnly ? null : (
              <button
                type="button"
                aria-label={`Remove ${p}`}
                disabled={busy}
                onClick={() => void save({ [field]: items.filter((x) => x !== p) })}
                style={css('min-width: 28px; min-height: 28px; border: 0; border-radius: 8px; background: rgba(255,255,255,0.08); color: #FF8A7B; font-size: 14px; cursor: pointer')}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {readOnly ? null : adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
            style={css('display: inline-flex; gap: 8px')}
          >
            <input
              autoFocus
              value={text}
              maxLength={200}
              placeholder={placeholder}
              aria-label={addLabel}
              onChange={(e) => {
                setText(e.target.value);
              }}
              style={css(`min-height: 44px; box-sizing: border-box; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.05); color: #EAF0FA; font-family: ${MONO}; font-size: 13px`)}
            />
            <button type="submit" disabled={busy || !text.trim()} style={css(`min-height: 44px; padding: 0 16px; border: 0; border-radius: 10px; background: ${ACCENT}; color: #03211D; font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer`)}>
              {busy ? 'Saving…' : 'Add'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
            }}
            style={css('min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px dashed rgba(255,255,255,0.25); background: transparent; color: #A3AEC2; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer')}
          >
            {addLabel}
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" style={css('margin: 10px 0 0; font-size: 13px; color: #FF8A7B')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
