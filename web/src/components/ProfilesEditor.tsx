'use client';

import { useState } from 'react';
import { css } from '@/lib/dc';
import { NETWORK_INFO, NETWORK_ORDER, SCREEN_INFO, SCREEN_ORDER } from '@/lib/profile-info';
import type { Settings } from '@/lib/settings';
import { useSettingsSave } from './useSettingsSave';

type Profile = Settings['profiles']['perFlow'][string];
type Network = Settings['profiles']['network'];
type Screen = Settings['profiles']['screen'];

const ACCENT = '#34E3CB';
const MONO = "'JetBrains Mono', monospace";
const NET_COLOR: Record<Network, string> = { none: ACCENT, 'fast-4g': '#6AA6FF', 'slow-4g': '#8B7CFF', 'fast-3g': '#FFC14D', 'slow-3g': '#FF6B5B' };
/** Drawn size in px for the screen shapes (scaled-down versions of the real sizes). */
const SHAPE: Record<Screen, [number, number]> = { 'android-small': [54, 96], android: [60, 130], iphone: [58, 126], tablet: [100, 132], desktop: [160, 100], laptop: [176, 112] };
const CARD =
  'background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.016));border:1px solid rgba(255,255,255,0.085);border-radius:22px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 28px 56px -30px rgba(0,0,0,0.9)';

export interface EditorFlow {
  readonly file: string;
  readonly name: string;
}

const select = `min-height: 44px; box-sizing: border-box; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); background: #0B1019; color: #EAF0FA; font-family: inherit; font-size: 13.5px`;

/** Default network and screen, plus per-flow overrides. Saved together. */
export function ProfilesEditor({ initial, flows, readOnly }: { initial: Settings['profiles']; flows: readonly EditorFlow[]; readOnly: boolean }) {
  const { busy, error, saved, save } = useSettingsSave('profiles');
  const [network, setNetwork] = useState<Network>(initial.network);
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const [perFlow, setPerFlow] = useState<Record<string, Profile>>(initial.perFlow);
  const rows: EditorFlow[] = [...flows, ...Object.keys(perFlow).filter((k) => !flows.some((f) => f.file === k)).map((file) => ({ file, name: file }))];
  const disabled = readOnly || busy;

  return (
    <>
      <div style={css('display: flex; flex-wrap: wrap; gap: 24px; align-items: stretch')}>
        <section style={css(`${CARD}; flex: 1 1 520px; min-width: 0; padding: 26px 28px`)}>
          <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px')}>Network</div>
          <div style={css('font-size: 13px; color: #A3AEC2; margin-bottom: 18px')}>The default for every flow. Pick one.</div>
          <div style={css('display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px')}>
            {NETWORK_ORDER.map((n) => {
              const c = NET_COLOR[n];
              const on = n === network;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => {
                    setNetwork(n);
                  }}
                  style={css(
                    `text-align: left; font-family: inherit; color: inherit; cursor: ${disabled ? 'not-allowed' : 'pointer'}; padding: 18px 18px 16px; border-radius: 18px; border: ${on ? `2px solid ${c}` : `1px solid ${c}55`}; background: linear-gradient(180deg,${c}${on ? '24' : '14'},rgba(255,255,255,0.012)); box-shadow: 0 0 40px -20px ${c}99, inset 0 1px 0 rgba(255,255,255,0.06)`,
                  )}
                >
                  <span style={css('display: flex; justify-content: space-between; align-items: flex-start')}>
                    <span style={css('font-size: 16px; font-weight: 800')}>{NETWORK_INFO[n].label}</span>
                    <span aria-hidden="true" style={css('display: flex; align-items: flex-end; gap: 3px; height: 22px')}>
                      {[1, 2, 3, 4].map((i) => (
                        <span key={i} style={css(`width: 6px; border-radius: 2px; height: ${String(5 + i * 4)}px; background: ${i <= NETWORK_INFO[n].bars ? c : 'rgba(255,255,255,0.14)'}${i <= NETWORK_INFO[n].bars ? `; box-shadow: 0 0 8px ${c}` : ''}`)} />
                      ))}
                    </span>
                  </span>
                  <span style={css('display: block; font-size: 13px; color: #A3AEC2; margin-top: 8px; line-height: 1.45')}>{NETWORK_INFO[n].text}</span>
                  <span style={css(`margin-top: 14px; display: inline-block; font-size: 12px; font-weight: 800; padding: 5px 11px; border-radius: 99px; background: rgba(255,255,255,0.07); color: ${c}`)}>{on ? 'Default' : 'Choose'}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section style={css(`${CARD}; flex: 1 1 520px; min-width: 0; padding: 26px 28px`)}>
          <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 6px')}>Screens</div>
          <div style={css('font-size: 13px; color: #A3AEC2; margin-bottom: 18px')}>The default for every flow. Pick one.</div>
          <div style={css('display: flex; align-items: flex-end; gap: 22px; flex-wrap: wrap')}>
            {SCREEN_ORDER.map((s) => {
              const on = s === screen;
              const [w, h] = SHAPE[s];
              const info = SCREEN_INFO[s];
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => {
                    setScreen(s);
                  }}
                  style={css(`display: flex; flex-direction: column; align-items: center; gap: 10px; border: 0; background: transparent; padding: 4px; font-family: inherit; color: inherit; cursor: ${disabled ? 'not-allowed' : 'pointer'}`)}
                >
                  <span style={css(`display: block; width: ${String(w)}px; height: ${String(h)}px; border-radius: ${info.touch ? 14 : 8}px; border: 2px solid ${on ? ACCENT : 'rgba(255,255,255,0.3)'}; padding: 6px; box-sizing: border-box; ${on ? 'box-shadow: 0 0 34px -4px rgba(52,227,203,0.55)' : ''}`)}>
                    <span style={css(`display: block; width: 100%; height: 100%; border-radius: 8px; background: ${on ? 'rgba(52,227,203,0.15)' : 'rgba(255,255,255,0.06)'}`)} />
                  </span>
                  <span style={css('text-align: center')}>
                    <span style={css('display: block; font-size: 13.5px; font-weight: 800')}>{info.label}</span>
                    <span style={css(`display: block; font-size: 12px; color: #8E9BB2; font-family: ${MONO}; margin-top: 2px`)}>
                      {String(info.width)} × {String(info.height)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <section style={css(`${CARD}; padding: 26px 30px`)}>
        <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px')}>Per-flow overrides</div>
        <div style={css('font-size: 13.5px; color: #A3AEC2; margin-top: 4px; margin-bottom: 14px')}>A flow can run under its own conditions instead of the default.</div>
        {rows.length === 0 ? (
          <div style={css('font-size: 14px; color: #8E9BB2; border-top: 1px solid rgba(255,255,255,0.07); padding-top: 14px')}>No flow files found in flows/.</div>
        ) : (
          rows.map((f) => {
            const o = perFlow[f.file];
            return (
              <div key={f.file} style={css('display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 14px 0; border-top: 1px solid rgba(255,255,255,0.07)')}>
                <div style={css('flex: 1 1 220px; min-width: 0')}>
                  <div style={css('font-size: 15px; font-weight: 700; overflow-wrap: anywhere')}>{f.name}</div>
                  <div style={css(`font-size: 12px; color: #8E9BB2; font-family: ${MONO}; margin-top: 2px; overflow-wrap: anywhere`)}>{f.file}</div>
                </div>
                {o ? (
                  <>
                    <select
                      aria-label={`Network for ${f.name}`}
                      value={o.network}
                      disabled={disabled}
                      onChange={(e) => {
                        const v = NETWORK_ORDER.find((n) => n === e.target.value);
                        if (v) setPerFlow({ ...perFlow, [f.file]: { ...o, network: v } });
                      }}
                      style={css(select)}
                    >
                      {NETWORK_ORDER.map((n) => (
                        <option key={n} value={n}>
                          {NETWORK_INFO[n].label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Screen for ${f.name}`}
                      value={o.screen}
                      disabled={disabled}
                      onChange={(e) => {
                        const v = SCREEN_ORDER.find((s) => s === e.target.value);
                        if (v) setPerFlow({ ...perFlow, [f.file]: { ...o, screen: v } });
                      }}
                      style={css(select)}
                    >
                      {SCREEN_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {SCREEN_INFO[s].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        const rest = { ...perFlow };
                        delete rest[f.file];
                        setPerFlow(rest);
                      }}
                      style={css('min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.16); background: transparent; color: #A3AEC2; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer')}
                    >
                      Use default
                    </button>
                  </>
                ) : (
                  <>
                    <span style={css('font-size: 13px; color: #8E9BB2')}>
                      Uses the default: {NETWORK_INFO[network].label}, {SCREEN_INFO[screen].label}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setPerFlow({ ...perFlow, [f.file]: { network, screen } });
                      }}
                      style={css('min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px dashed rgba(255,255,255,0.25); background: transparent; color: #A3AEC2; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer')}
                    >
                      Override
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
        <div style={css('display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.07)')}>
          <button
            type="button"
            disabled={disabled}
            title={readOnly ? 'View-only account: you cannot change this' : undefined}
            onClick={() => void save({ network, screen, perFlow })}
            style={css(`min-height: 50px; padding: 0 26px; border: 0; border-radius: 14px; background: ${ACCENT}; color: #03211D; font-family: inherit; font-size: 15px; font-weight: 800; cursor: ${disabled ? 'not-allowed' : 'pointer'}; opacity: ${disabled ? 0.5 : 1}`)}
          >
            {busy ? 'Saving…' : 'Save profiles'}
          </button>
          {saved ? <span role="status" style={css('font-size: 13px; color: #34E3CB')}>Saved. The next run uses these conditions.</span> : null}
          {error ? (
            <span role="alert" style={css('font-size: 13px; color: #FF8A7B')}>
              {error}
            </span>
          ) : null}
          {readOnly ? <span style={css('font-size: 13px; color: #8E9BB2')}>View-only account.</span> : null}
        </div>
      </section>
    </>
  );
}
