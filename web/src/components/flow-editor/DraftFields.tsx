'use client';

import Link from 'next/link';
import { css } from '@/lib/dc';
import type { DraftStep, FlowDraft } from '@/lib/flow-yaml';
import { field, input, inputMono, label, select, smallBtn } from './styles';

interface Props {
  readonly draft: FlowDraft;
  readonly onChange: (next: FlowDraft) => void;
  /** Names of saved test accounts (never values). */
  readonly accounts: readonly string[];
  readonly idPrefix: string;
  /** Hide the variations editor (the import review keeps drafts short). */
  readonly withVariations?: boolean;
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/** The flow form: name, start page, saved test account, tags, steps with expectations, variations. */
export function DraftFields({ draft, onChange, accounts, idPrefix, withVariations = true }: Props) {
  const set = (patch: Partial<FlowDraft>): void => onChange({ ...draft, ...patch });
  const setStep = (i: number, patch: Partial<DraftStep>): void => set({ steps: draft.steps.map((s, n) => (n === i ? { ...s, ...patch } : s)) });
  const id = (s: string): string => `${idPrefix}-${s}`;
  const known = accounts.includes(draft.login);

  return (
    <div style={css('display: flex; flex-direction: column; gap: 16px')}>
      <div style={field}>
        <label htmlFor={id('name')} style={label}>Flow name</label>
        <input id={id('name')} value={draft.name} maxLength={200} onChange={(e) => set({ name: e.target.value })} style={input} />
      </div>
      <div style={css('display: flex; gap: 12px; flex-wrap: wrap')}>
        <div style={css('flex: 1 1 160px; display: flex; flex-direction: column; gap: 6px')}>
          <label htmlFor={id('start')} style={label}>Start page</label>
          <input id={id('start')} value={draft.start} maxLength={500} onChange={(e) => set({ start: e.target.value })} style={inputMono} />
        </div>
        <div style={css('flex: 1 1 160px; display: flex; flex-direction: column; gap: 6px')}>
          <label htmlFor={id('login')} style={label}>Saved test account</label>
          <select id={id('login')} value={draft.login} onChange={(e) => set({ login: e.target.value })} style={select}>
            <option value="">No login</option>
            {draft.login && !known ? <option value={draft.login}>{draft.login} (not saved)</option> : null}
            {accounts.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {accounts.length === 0 ? (
            <span style={css('font-size: 12px; color: #8E9BB2')}>
              No saved test accounts yet. Add one in <Link href="/settings" style={css('color: #34E3CB; font-weight: 700')}>Settings</Link>. Passwords never go in a flow file.
            </span>
          ) : null}
        </div>
      </div>
      <div style={field}>
        <label htmlFor={id('tags')} style={label}>Tags (separate with commas)</label>
        <input
          id={id('tags')}
          value={draft.tags.join(', ')}
          onChange={(e) => set({ tags: e.target.value.split(',').map((t) => t.replace(/^\s+/, '')) })}
          placeholder="payments, critical"
          style={input}
        />
      </div>

      <div>
        <div style={label}>Steps NightQA will take</div>
        <ol style={css('list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px')}>
          {draft.steps.map((s, i) => (
            <li key={i} style={css('display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08)')}>
              <span aria-hidden="true" style={css("flex: 0 0 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; font-family: 'JetBrains Mono', monospace; background: rgba(52,227,203,0.16); color: #34E3CB; margin-top: 10px")}>{i + 1}</span>
              <div style={css('flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px')}>
                <input aria-label={`Step ${String(i + 1)}`} value={s.text} maxLength={1000} placeholder="What the user does, in plain words" onChange={(e) => setStep(i, { text: e.target.value })} style={input} />
                <input aria-label={`Expectation for step ${String(i + 1)}`} value={s.expect} maxLength={1000} placeholder="Expect: something specific you can see, e.g. cart shows 1 item" onChange={(e) => setStep(i, { expect: e.target.value })} style={css('min-height: 40px; box-sizing: border-box; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(52,227,203,0.3); background: #05080D; color: #EAF0FA; font-family: inherit; font-size: 13.5px; font-weight: 600; width: 100%')} />
              </div>
              <div style={css('display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end')}>
                <button type="button" aria-label={`Move step ${String(i + 1)} up`} disabled={i === 0} style={smallBtn(i === 0)} onClick={() => set({ steps: move(draft.steps, i, i - 1) })}>↑</button>
                <button type="button" aria-label={`Move step ${String(i + 1)} down`} disabled={i === draft.steps.length - 1} style={smallBtn(i === draft.steps.length - 1)} onClick={() => set({ steps: move(draft.steps, i, i + 1) })}>↓</button>
                <button type="button" aria-label={`Remove step ${String(i + 1)}`} disabled={draft.steps.length === 1} style={smallBtn(draft.steps.length === 1)} onClick={() => set({ steps: draft.steps.filter((_, n) => n !== i) })}>✕</button>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" style={{ ...smallBtn(), marginTop: 10, padding: '0 14px' }} onClick={() => set({ steps: [...draft.steps, { text: '', expect: '' }] })}>
          Add a step
        </button>
      </div>

      {withVariations ? (
        <div>
          <div style={label}>Variations NightQA will try</div>
          <ul style={css('list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px')}>
            {draft.variations.map((v, i) => (
              <li key={i} style={css('display: flex; gap: 8px')}>
                <input aria-label={`Variation ${String(i + 1)}`} value={v} maxLength={1000} placeholder="e.g. try an expired coupon" onChange={(e) => set({ variations: draft.variations.map((x, n) => (n === i ? e.target.value : x)) })} style={input} />
                <button type="button" aria-label={`Remove variation ${String(i + 1)}`} style={smallBtn()} onClick={() => set({ variations: draft.variations.filter((_, n) => n !== i) })}>✕</button>
              </li>
            ))}
          </ul>
          <button type="button" style={{ ...smallBtn(), marginTop: 10, padding: '0 14px' }} onClick={() => set({ variations: [...draft.variations, ''] })}>
            Add a variation
          </button>
        </div>
      ) : null}
    </div>
  );
}
