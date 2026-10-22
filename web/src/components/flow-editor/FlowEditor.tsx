'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { RunFlowButtons } from '@/components/RunFlowButtons';
import { css } from '@/lib/dc';
import { checkDraft } from '@/lib/flow-check';
import { BETTER_EXPECT_EXAMPLE, isVagueExpectation } from '@/lib/flow-rules';
import type { FlowDraft } from '@/lib/flow-yaml';
import { draftToYaml } from '@/lib/flow-yaml';
import { CARD, MONO } from '@/screens/live/ui';
import { deleteFlowFile, saveDraft } from './api';
import { DraftFields } from './DraftFields';
import { ACCENT, dangerBtn, ghostBtn, primaryBtn } from './styles';
import { YamlPane } from './YamlPane';

interface Props {
  readonly initial: FlowDraft;
  /** The file being edited, e.g. flows/checkout.yaml. Undefined for a new flow. */
  readonly file?: string;
  readonly hasSavedTest: boolean;
  readonly accounts: readonly string[];
  readonly canEdit: boolean;
  readonly budgetLine: string;
}

const chip = (fg: string, bg: string): string => `font-size: 12px; font-weight: 700; color: ${fg}; background: ${bg}; padding: 4px 10px; border-radius: 99px`;

/** Create or edit a flow: the form on the left, the YAML it will write and the engine's verdict on the right. */
export function FlowEditor({ initial, file: initialFile, hasSavedTest, accounts, canEdit, budgetLine }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<FlowDraft>(initial);
  const [file, setFile] = useState<string | undefined>(initialFile);
  const [savedYaml, setSavedYaml] = useState<string>(initialFile ? draftToYaml(initial) : '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const check = useMemo(() => checkDraft(draft), [draft]);
  const valid = check.validation.ok;
  const dirty = check.yaml !== savedYaml;
  const stepsShown = draft.steps.filter((s) => s.text.trim() || s.expect.trim());

  async function save(): Promise<void> {
    setBusy(true);
    setMessage(null);
    const r = await saveDraft(draft, file ? { file } : {});
    setBusy(false);
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.error });
      return;
    }
    setSavedYaml(check.yaml);
    setMessage({ kind: 'ok', text: `Saved to ${r.file}.` });
    if (!file) {
      setFile(r.file);
      router.replace(`/editor?file=${encodeURIComponent(r.file)}`);
    }
    router.refresh();
  }

  async function remove(): Promise<void> {
    if (!file) return;
    setBusy(true);
    const r = await deleteFlowFile(file);
    setBusy(false);
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.error });
      setConfirming(false);
      return;
    }
    router.push('/flows');
  }

  const warnings = check.validation.ok ? check.validation.warnings : [];
  const issues = check.validation.ok ? [] : check.validation.issues;

  return (
    <>
      <header style={css('display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 18px')}>
        <div style={css('min-width: 0')}>
          <div style={css('font-size: 13.5px; color: #A3AEC2')}>
            <Link href="/flows">Flows</Link> / {draft.name.trim() || 'New flow'}
          </div>
          <h1 style={css('margin: 10px 0 6px; font-size: 40px; font-weight: 800; letter-spacing: -1.5px; overflow-wrap: anywhere')}>{draft.name.trim() || 'New flow'}</h1>
          <div style={css(`font-size: 13.5px; color: #A3AEC2; font-family: ${MONO}`)}>
            {file ?? 'flows/'} · reviewed like code in your repo
          </div>
        </div>
        <div style={css('display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-start')}>
          {file ? (
            <div>
              <RunFlowButtons flow={{ file, name: draft.name, hasSavedTest }} readOnly={!canEdit || dirty} />
              {dirty ? <div style={css('font-size: 12px; color: #8E9BB2; margin-top: 8px')}>Save first to run the latest version.</div> : null}
            </div>
          ) : null}
          {file && canEdit ? (
            <button type="button" style={dangerBtn} onClick={() => setConfirming(true)} disabled={busy}>Delete</button>
          ) : null}
          <button
            type="button"
            style={primaryBtn(!valid || busy || !dirty || !canEdit)}
            disabled={!valid || busy || !dirty || !canEdit}
            title={!canEdit ? 'View-only account: you cannot save flows' : !valid ? 'Fix the problems on the right first' : !dirty ? 'Nothing changed' : undefined}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {confirming ? (
        <div role="alertdialog" aria-label="Confirm delete" style={css('padding: 20px 22px; border-radius: 22px; border: 1px solid rgba(255,107,91,0.55); background: linear-gradient(180deg, rgba(255,107,91,0.12), rgba(255,107,91,0.03)); display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between')}>
          <div style={css('font-size: 15px; font-weight: 700; line-height: 1.5')}>
            Delete {file}? The file is removed from your flows/ folder. Saved tests and past runs are kept. This cannot be undone here.
          </div>
          <div style={css('display: flex; gap: 10px')}>
            <button type="button" style={ghostBtn} onClick={() => setConfirming(false)}>Keep it</button>
            <button type="button" style={dangerBtn} disabled={busy} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete flow'}</button>
          </div>
        </div>
      ) : null}

      {message ? (
        <div role={message.kind === 'error' ? 'alert' : 'status'} style={css(`padding: 14px 18px; border-radius: 14px; font-size: 14px; font-weight: 700; ${message.kind === 'ok' ? `color: ${ACCENT}; background: rgba(52,227,203,0.1); border: 1px solid rgba(52,227,203,0.4)` : 'color: #FF8A7B; background: rgba(255,107,91,0.1); border: 1px solid rgba(255,107,91,0.45)'}`)}>
          {message.text}
        </div>
      ) : null}
      {!canEdit ? <div style={css('font-size: 13px; color: #FFC14D')}>Your account is view-only, so changes cannot be saved.</div> : null}

      <div style={css('display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start')}>
        <div style={css('flex: 1.15 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 24px')}>
          <section style={css(`${CARD}; padding: 24px 26px`)} aria-label="Flow form">
            <DraftFields draft={draft} onChange={setDraft} accounts={accounts} idPrefix="ed" />
          </section>
          <section style={css(`${CARD}; overflow: hidden`)} aria-label="Flow file">
            <div style={css('padding: 14px 22px; border-bottom: 1px solid rgba(255,255,255,0.07); display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap')}>
              <div style={css('font-size: 14px; font-weight: 800')}>Flow file</div>
              <div style={css('display: flex; gap: 8px')}>
                <span style={css(chip(valid ? ACCENT : '#FF8A7B', valid ? 'rgba(52,227,203,0.13)' : 'rgba(255,107,91,0.16)'))}>{valid ? 'YAML valid' : `${String(issues.length)} ${issues.length === 1 ? 'problem' : 'problems'}`}</span>
                {warnings.length > 0 ? <span style={css(chip('#FFC14D', 'rgba(255,193,77,0.16)'))}>{warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}</span> : null}
              </div>
            </div>
            <YamlPane source={check.yaml} warnLines={check.warnLines} errorLines={check.errorLines} />
            <div style={css('padding: 14px 22px; border-top: 1px solid rgba(255,255,255,0.07); display: flex; gap: 8px; flex-wrap: wrap; align-items: center')}>
              <span style={css('font-size: 12.5px; color: #8E9BB2')}>Other ways to create flows:</span>
              <Link href="/import" style={css(`font-size: 12.5px; font-weight: 800; color: ${ACCENT}`)}>Import from Excel</Link>
            </div>
          </section>
        </div>

        <aside style={css('flex: 1 1 440px; min-width: 0; display: flex; flex-direction: column; gap: 20px')}>
          {issues.map((i, n) => (
            <div key={n} role="alert" style={css('padding: 20px 22px; border-radius: 22px; border: 1px solid rgba(255,107,91,0.55); background: linear-gradient(180deg, rgba(255,107,91,0.12), rgba(255,107,91,0.03)); box-shadow: 0 0 50px -18px rgba(255,107,91,0.55)')}>
              <span style={css('font-size: 12px; font-weight: 800; color: #FF8A7B; background: rgba(255,107,91,0.18); padding: 4px 11px; border-radius: 99px')}>Problem · line {i.line}</span>
              <div style={css('font-size: 15px; margin-top: 12px; line-height: 1.5; font-weight: 600; overflow-wrap: anywhere')}>{i.message}</div>
            </div>
          ))}
          {warnings.map((w, n) => (
            <div key={n} style={css('padding: 20px 22px; border-radius: 22px; border: 1px solid rgba(255,193,77,0.55); background: linear-gradient(180deg, rgba(255,193,77,0.12), rgba(255,193,77,0.03)); box-shadow: 0 0 50px -18px rgba(255,193,77,0.55)')}>
              <span style={css('font-size: 12px; font-weight: 800; color: #FFC14D; background: rgba(255,193,77,0.18); padding: 4px 11px; border-radius: 99px')}>Warning · line {w.line}</span>
              <div style={css('font-size: 15px; margin-top: 12px; line-height: 1.5; font-weight: 600; overflow-wrap: anywhere')}>Step {w.step}: this cannot be checked. Name something specific.</div>
              <div style={css(`margin-top: 12px; background: #05080D; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 11px 14px; font-family: ${MONO}; font-size: 12.5px; color: #C7D0E0`)}>For example, expect: {BETTER_EXPECT_EXAMPLE}</div>
            </div>
          ))}

          <div style={css(`${CARD}; padding: 24px 26px`)}>
            <div style={css('display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 18px')}>
              <div style={css('font-size: 18px; font-weight: 800; letter-spacing: -0.4px')}>How the agent will run it</div>
              <div style={css('font-size: 12.5px; color: #8E9BB2')}>{stepsShown.length} {stepsShown.length === 1 ? 'step' : 'steps'}</div>
            </div>
            {stepsShown.length === 0 ? (
              <div style={css('font-size: 14px; color: #8E9BB2')}>Add a step and it shows up here.</div>
            ) : (
              <ol style={css('list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column')}>
                {stepsShown.map((s, i) => {
                  const ok = !s.expect.trim() || !isVagueExpectation(s.expect);
                  return (
                    <li key={i} style={css('display: flex; gap: 16px; align-items: stretch')}>
                      <div style={css('display: flex; flex-direction: column; align-items: center; width: 28px; flex: 0 0 28px')}>
                        <span style={css(`width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12.5px; font-weight: 800; font-family: ${MONO}; ${ok ? `background: rgba(52,227,203,0.16); color: ${ACCENT}; box-shadow: 0 0 14px rgba(52,227,203,0.3)` : 'background: rgba(255,193,77,0.2); color: #FFC14D; box-shadow: 0 0 14px rgba(255,193,77,0.4)'}`)}>{i + 1}</span>
                        {i === stepsShown.length - 1 ? null : <span style={css('flex: 1; width: 2px; margin-top: 4px; background: linear-gradient(180deg, rgba(52,227,203,0.5), rgba(255,255,255,0.1)); min-height: 16px')} />}
                      </div>
                      <div style={css('flex: 1; padding-bottom: 16px; min-width: 0')}>
                        <div style={css('font-size: 14.5px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere')}>{s.text || 'Untitled step'}</div>
                        {s.expect.trim() ? (
                          <div style={css(`display: inline-block; margin-top: 8px; font-size: 12.5px; font-weight: 700; padding: 5px 11px; border-radius: 9px; overflow-wrap: anywhere; color: ${ok ? ACCENT : '#FFC14D'}; background: ${ok ? 'rgba(52,227,203,0.12)' : 'rgba(255,193,77,0.15)'}`)}>
                            Expect: {s.expect}{ok ? '' : '. Not checkable yet.'}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div style={css(`${CARD}; padding: 22px 26px`)}>
            <div style={css('font-size: 16px; font-weight: 800; margin-bottom: 14px')}>Variations NightQA will try</div>
            {draft.variations.filter((v) => v.trim()).length === 0 ? (
              <div style={css('font-size: 13.5px; color: #8E9BB2')}>No variations yet. Add things like &ldquo;try an expired coupon&rdquo; on the left.</div>
            ) : (
              <div style={css('display: flex; flex-wrap: wrap; gap: 8px')}>
                {draft.variations.filter((v) => v.trim()).map((v, i) => (
                  <span key={i} style={css('font-size: 13px; font-weight: 700; padding: 9px 14px; border-radius: 12px; border: 1px solid rgba(139,124,255,0.45); background: rgba(139,124,255,0.1); color: #D3C9FF; overflow-wrap: anywhere')}>{v}</span>
                ))}
              </div>
            )}
            <div style={css('font-size: 12.5px; color: #8E9BB2; margin-top: 18px; line-height: 1.5')}>{budgetLine}</div>
          </div>
        </aside>
      </div>
    </>
  );
}
