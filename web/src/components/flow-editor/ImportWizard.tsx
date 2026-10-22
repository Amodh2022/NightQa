'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { css } from '@/lib/dc';
import { checkDraft } from '@/lib/flow-check';
import { IMPORT_LIMITS, TARGETS, TARGET_LABELS, rowsToDrafts, type ImportDraft, type Mapping, type Table, type Target } from '@/lib/flow-import';
import type { FlowDraft } from '@/lib/flow-yaml';
import { CARD, MONO } from '@/screens/live/ui';
import { saveDraft } from './api';
import { DraftFields } from './DraftFields';
import { ACCENT, field, ghostBtn, inputMono, label, primaryBtn, select } from './styles';

type Stage = 'upload' | 'map' | 'review' | 'save';
type Status = 'waiting' | 'saved' | 'skipped';

interface Item extends ImportDraft {
  status: Status;
  savedAs?: string;
}

const STEPS: readonly (readonly [Stage, string])[] = [
  ['upload', 'Upload'],
  ['map', 'Map columns'],
  ['review', 'Review drafts'],
  ['save', 'Save'],
];
const ORDER: readonly Stage[] = ['upload', 'map', 'review', 'save'];

const pill = (state: 'done' | 'now' | 'later'): string =>
  `display: flex; align-items: center; gap: 10px; padding: 8px 16px 8px 8px; border-radius: 99px; border: 1px solid ${state === 'now' ? 'rgba(52,227,203,0.6)' : 'rgba(255,255,255,0.09)'}; background: ${state === 'now' ? 'rgba(52,227,203,0.1)' : 'rgba(255,255,255,0.03)'}; color: ${state === 'later' ? '#8E9BB2' : '#EAF0FA'}`;
const pillNum = (state: 'done' | 'now' | 'later'): string =>
  `width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; ${state === 'done' ? `background: ${ACCENT}; color: #03211D` : state === 'now' ? 'background: #EAF0FA; color: #070A10' : 'background: rgba(255,255,255,0.1); color: #A3AEC2'}`;

/** Upload, map columns, review one draft at a time, save. Nothing is saved without a click on "Confirm and save". */
export function ImportWizard({ accounts, canEdit }: { accounts: readonly string[]; canEdit: boolean }) {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [defaults, setDefaults] = useState({ start: '/', login: '' });
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(form: HTMLFormElement): Promise<void> {
    const file = new FormData(form).get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a .csv or .xlsx file first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/import', { method: 'POST', body: new FormData(form) });
      const json = (await res.json()) as { error?: string; fileName?: string; table?: Table; mapping?: Mapping };
      if (!res.ok || !json.table || !json.mapping) throw new Error(json.error ?? 'Could not read that file.');
      setFileName(json.fileName ?? file.name);
      setTable(json.table);
      setMapping(json.mapping);
      setStage('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  function build(): void {
    if (!table || !mapping) return;
    const drafts = rowsToDrafts(table, mapping, defaults);
    setItems(drafts.map((d) => ({ ...d, status: 'waiting' })));
    setCurrent(0);
    setStage('review');
  }

  function nextWaiting(list: readonly Item[], from: number): number {
    const after = list.findIndex((it, i) => i > from && it.status === 'waiting');
    return after >= 0 ? after : list.findIndex((it) => it.status === 'waiting');
  }

  function finish(list: Item[], from: number): void {
    const n = nextWaiting(list, from);
    if (n < 0) setStage('save');
    else setCurrent(n);
  }

  function edit(draft: FlowDraft): void {
    setItems((prev) => prev.map((it, i) => (i === current ? { ...it, draft } : it)));
  }

  async function confirm(): Promise<void> {
    const it = items[current];
    if (!it) return;
    setBusy(true);
    setError(null);
    const r = await saveDraft(it.draft, { onConflict: 'suffix' });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const next = items.map((x, i): Item => (i === current ? { ...x, status: 'saved', savedAs: r.file } : x));
    setItems(next);
    finish(next, current);
  }

  function skip(): void {
    const next = items.map((x, i): Item => (i === current ? { ...x, status: 'skipped' } : x));
    setItems(next);
    finish(next, current);
  }

  const reviewing = stage === 'review' ? items[current] : undefined;
  const check = useMemo(() => (reviewing ? checkDraft(reviewing.draft) : undefined), [reviewing]);
  const stageIdx = ORDER.indexOf(stage);
  const saved = items.filter((i) => i.status === 'saved');

  return (
    <>
      <section aria-label="Progress" style={css('display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center')}>
        {STEPS.map(([key, text], i) => {
          const state = i < stageIdx ? 'done' : i === stageIdx ? 'now' : 'later';
          return (
            <div key={key} aria-current={state === 'now' ? 'step' : undefined} style={css(pill(state))}>
              <span style={css(pillNum(state))}>{i + 1}</span>
              <span style={css('font-size: 14px; font-weight: 700')}>{text}</span>
            </div>
          );
        })}
      </section>

      {error ? (
        <div role="alert" style={css('padding: 14px 18px; border-radius: 14px; font-size: 14px; font-weight: 700; color: #FF8A7B; background: rgba(255,107,91,0.1); border: 1px solid rgba(255,107,91,0.45); overflow-wrap: anywhere')}>{error}</div>
      ) : null}

      {stage === 'upload' ? (
        <section style={css(`${CARD}; padding: 28px 30px; max-width: 720px`)}>
          <div style={css('font-size: 18px; font-weight: 800; letter-spacing: -0.4px')}>Choose your test cases</div>
          <p style={css('font-size: 14px; color: #A3AEC2; line-height: 1.55; margin: 10px 0 20px')}>
            A .csv or .xlsx file, one test case per row, with a header row. Up to {IMPORT_LIMITS.maxRows} rows and {IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. The file is read as data only: formulas are not evaluated and macros are refused.
          </p>
          {canEdit ? (
            <form onSubmit={(e) => { e.preventDefault(); void upload(e.currentTarget); }} style={css('display: flex; flex-direction: column; gap: 16px; align-items: flex-start')}>
              <div style={field}>
                <label htmlFor="imp-file" style={label}>Test case file</label>
                <input id="imp-file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={css('font-family: inherit; font-size: 14px; color: #EAF0FA')} />
              </div>
              <button type="submit" disabled={busy} style={primaryBtn(busy)}>{busy ? 'Reading…' : 'Read the file'}</button>
            </form>
          ) : (
            <div style={css('font-size: 14px; color: #FFC14D')}>Your account is view-only, so files cannot be imported.</div>
          )}
        </section>
      ) : null}

      {stage === 'map' && table && mapping ? (
        <section style={css(`${CARD}; padding: 26px 28px; max-width: 900px`)}>
          <div style={css('display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; align-items: baseline')}>
            <div style={css('font-size: 18px; font-weight: 800; letter-spacing: -0.4px; overflow-wrap: anywhere')}>{fileName}</div>
            <span style={css('font-size: 12.5px; color: #A3AEC2')}>
              {table.rows.length} {table.rows.length === 1 ? 'test case' : 'test cases'} found{table.truncated ? ` (only the first ${String(IMPORT_LIMITS.maxRows)} are used)` : ''}
            </span>
          </div>
          <p style={css('font-size: 14px; color: #A3AEC2; line-height: 1.55; margin: 10px 0 18px')}>We matched your column headers to what a flow needs. Change anything that is off.</p>
          <div style={css('display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px')}>
            {TARGETS.map((t: Target) => (
              <div key={t} style={field}>
                <label htmlFor={`map-${t}`} style={label}>{TARGET_LABELS[t]}{t === 'name' || t === 'steps' ? ' (needed)' : ''}</label>
                <select id={`map-${t}`} value={mapping[t]} onChange={(e) => setMapping({ ...mapping, [t]: Number(e.target.value) })} style={select}>
                  <option value={-1}>Not in the file</option>
                  {table.headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div style={css('display: flex; gap: 14px; flex-wrap: wrap; margin-top: 18px')}>
            <div style={css('flex: 1 1 200px; display: flex; flex-direction: column; gap: 6px')}>
              <label htmlFor="def-start" style={label}>Start page when a row has none</label>
              <input id="def-start" value={defaults.start} onChange={(e) => setDefaults({ ...defaults, start: e.target.value })} style={inputMono} />
            </div>
            <div style={css('flex: 1 1 200px; display: flex; flex-direction: column; gap: 6px')}>
              <label htmlFor="def-login" style={label}>Saved test account when a row has none</label>
              <select id="def-login" value={defaults.login} onChange={(e) => setDefaults({ ...defaults, login: e.target.value })} style={select}>
                <option value="">No login</option>
                {accounts.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={css('display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap')}>
            <button type="button" style={primaryBtn(mapping.name < 0 || mapping.steps < 0)} disabled={mapping.name < 0 || mapping.steps < 0} onClick={build}>Build drafts</button>
            <button type="button" style={ghostBtn} onClick={() => { setStage('upload'); setError(null); }}>Choose another file</button>
          </div>
        </section>
      ) : null}

      {stage === 'review' && table && mapping && reviewing && check ? (
        <div style={css('display: flex; flex-wrap: wrap; gap: 26px; align-items: flex-start')}>
          <section style={css(`${CARD}; flex: 1.2 1 560px; min-width: 0; overflow: hidden`)} aria-label="Rows in your file">
            <div style={css('padding: 16px 22px; border-bottom: 1px solid rgba(255,255,255,0.07); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px')}>
              <div style={css('font-size: 15px; font-weight: 800; overflow-wrap: anywhere')}>{fileName}</div>
              <span style={css('font-size: 12.5px; color: #A3AEC2')}>{table.rows.length} test cases found</span>
            </div>
            <div style={css('overflow-x: auto')}>
              <div style={css('min-width: 640px')}>
                <div style={css('display: grid; grid-template-columns: 44px 80px 1.1fr 1.6fr 1.5fr; background: rgba(255,255,255,0.05); font-size: 12px; font-weight: 800; color: #A3AEC2')}>
                  {['', 'ID', 'Scenario', 'Steps', 'Expected result'].map((h, i) => (
                    <div key={i} style={css('padding: 11px 12px; border-right: 1px solid rgba(255,255,255,0.06)')}>{h}</div>
                  ))}
                </div>
                {table.rows.map((r, i) => {
                  const on = i === current;
                  const cell = (t: Target): string => (mapping[t] >= 0 ? (r[mapping[t]] ?? '') : '');
                  const cellStyle = css('padding: 14px 12px; border-right: 1px solid rgba(255,255,255,0.05); overflow-wrap: anywhere');
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => { setCurrent(i); setError(null); }}
                      style={css(`all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: grid; grid-template-columns: 44px 80px 1.1fr 1.6fr 1.5fr; border-top: 1px solid rgba(255,255,255,0.07); font-size: 13.5px; line-height: 1.45; text-align: left; color: #EAF0FA; ${on ? 'background: rgba(52,227,203,0.1); box-shadow: inset 0 0 0 1.5px rgba(52,227,203,0.7), 0 0 30px -8px rgba(52,227,203,0.5)' : ''}`)}
                    >
                      <div style={css(`padding: 14px 12px; color: #6F7C94; background: rgba(255,255,255,0.03); font-family: ${MONO}; font-size: 12px`)}>{i + 1}</div>
                      <div style={css(`padding: 14px 12px; border-right: 1px solid rgba(255,255,255,0.05); font-family: ${MONO}; overflow-wrap: anywhere`)}>{cell('id')}</div>
                      <div style={{ ...cellStyle, fontWeight: 700 }}>{cell('name')}</div>
                      <div style={cellStyle}>{cell('steps')}</div>
                      <div style={cellStyle}>{cell('expect')}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={css('padding: 14px 22px; border-top: 1px solid rgba(255,255,255,0.07); font-size: 12.5px; color: #8E9BB2')}>
              Column mapping: {(['name', 'steps', 'expect'] as const).map((t) => `${mapping[t] >= 0 ? (table.headers[mapping[t]] ?? '') : 'none'} → ${t === 'name' ? 'flow name' : t === 'steps' ? 'steps' : 'expect'}`).join(' · ')}
            </div>
          </section>

          <section style={css('flex: 1 1 460px; min-width: 0; display: flex; flex-direction: column; gap: 18px')}>
            <div style={css(`display: flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 800; color: ${ACCENT}`)}>
              <span style={css(`flex: 1; height: 2px; background: linear-gradient(90deg, rgba(52,227,203,0.1), ${ACCENT}); box-shadow: 0 0 14px ${ACCENT}`)} />
              Draft from row {current + 1}{reviewing.reference ? ` (${reviewing.reference})` : ''}
            </div>
            <div style={css('padding: 24px 26px; border-radius: 24px; border: 1px solid rgba(52,227,203,0.5); background: linear-gradient(180deg, rgba(52,227,203,0.09), rgba(52,227,203,0.02)); box-shadow: 0 0 70px -22px rgba(52,227,203,0.55), inset 0 1px 0 rgba(255,255,255,0.08)')}>
              <div style={css('display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px')}>
                <span style={css('font-size: 12px; font-weight: 800; color: #B9A6FF; background: rgba(139,124,255,0.2); padding: 4px 11px; border-radius: 99px')}>Draft</span>
                <span style={css('font-size: 12.5px; color: #A3AEC2')}>Edit anything before saving</span>
              </div>
              {reviewing.status !== 'waiting' ? (
                <div style={css('font-size: 13px; color: #FFC14D; margin-bottom: 14px')}>
                  {reviewing.status === 'saved' ? `Already saved as ${reviewing.savedAs ?? 'a flow'}.` : 'You skipped this one.'}
                </div>
              ) : null}
              <DraftFields draft={reviewing.draft} onChange={edit} accounts={accounts} idPrefix="imp" withVariations={false} />
              {check.validation.ok
                ? check.validation.warnings.map((w, i) => (
                    <div key={i} style={css('margin-top: 16px; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,193,77,0.5); background: rgba(255,193,77,0.1); font-size: 13px; line-height: 1.5; color: #FFD98A; overflow-wrap: anywhere')}>
                      Step {w.step}: {w.message}
                    </div>
                  ))
                : check.validation.issues.map((p, i) => (
                    <div key={i} role="alert" style={css('margin-top: 16px; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,107,91,0.5); background: rgba(255,107,91,0.1); font-size: 13px; line-height: 1.5; color: #FFB4A9; overflow-wrap: anywhere')}>
                      {p.message}
                    </div>
                  ))}
              <div style={css('display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap')}>
                <button
                  type="button"
                  style={{ ...primaryBtn(!check.validation.ok || busy || reviewing.status !== 'waiting'), flex: '1 1 160px' }}
                  disabled={!check.validation.ok || busy || reviewing.status !== 'waiting'}
                  title={check.validation.ok ? undefined : 'Fix the problems above first'}
                  onClick={() => void confirm()}
                >
                  {busy ? 'Saving…' : 'Confirm and save'}
                </button>
                <button type="button" style={ghostBtn} disabled={busy || reviewing.status !== 'waiting'} onClick={skip}>Skip</button>
              </div>
            </div>
            <div style={css('display: flex; flex-wrap: wrap; gap: 8px')} aria-label="Draft queue">
              {items.map((it, i) => {
                const text = it.status === 'saved' ? 'saved' : it.status === 'skipped' ? 'skipped' : i === current ? 'reviewing' : 'waiting';
                const on = it.status === 'saved';
                return (
                  <span key={i} style={css(`font-size: 12.5px; font-weight: 700; padding: 7px 13px; border-radius: 99px; border: 1px solid rgba(255,255,255,0.1); background: ${on ? 'rgba(52,227,203,0.12)' : i === current ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)'}; color: ${on ? ACCENT : i === current ? '#FFFFFF' : '#8E9BB2'}`)}>
                    {it.reference || `Row ${String(i + 1)}`} {text}
                  </span>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {stage === 'save' ? (
        <section style={css(`${CARD}; padding: 28px 30px; max-width: 760px`)}>
          <div style={css('font-size: 20px; font-weight: 800; letter-spacing: -0.5px')}>
            {saved.length === 0 ? 'Nothing was saved' : `${String(saved.length)} ${saved.length === 1 ? 'flow' : 'flows'} saved`}
          </div>
          <p style={css('font-size: 14px; color: #A3AEC2; line-height: 1.55; margin: 8px 0 16px')}>
            {items.length - saved.length} skipped. Saved flows are plain YAML files in flows/. Open one to run it or change it.
          </p>
          <ul style={css('list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px')}>
            {saved.map((s) => (
              <li key={s.savedAs} style={css('display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08)')}>
                <span style={css('font-size: 14px; font-weight: 700; overflow-wrap: anywhere')}>{s.draft.name}</span>
                <Link href={`/editor?file=${encodeURIComponent(s.savedAs ?? '')}`} style={css(`font-size: 13px; font-weight: 800; color: ${ACCENT}`)}>
                  Open {s.savedAs}
                </Link>
              </li>
            ))}
          </ul>
          <div style={css('display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap')}>
            <Link href="/flows" style={primaryLink}>Go to flows</Link>
            <button type="button" style={ghostBtn} onClick={() => { setStage('upload'); setItems([]); setTable(null); setError(null); }}>Import another file</button>
          </div>
        </section>
      ) : null}
    </>
  );
}

const primaryLink = css(`min-height: 50px; box-sizing: border-box; padding: 0 26px; border-radius: 14px; background: ${ACCENT}; color: #03211D; display: inline-flex; align-items: center; font-size: 15px; font-weight: 800; box-shadow: 0 10px 36px -8px rgba(52,227,203,0.7)`);
