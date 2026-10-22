import type { FlowDraft } from '@/lib/flow-yaml';

export type SaveOutcome = { ok: true; file: string } | { ok: false; error: string };

async function send(method: 'POST' | 'DELETE', body: unknown): Promise<{ ok: boolean; json: { error?: string; file?: string } }> {
  try {
    const res = await fetch('/api/flows', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as { error?: string; file?: string } };
  } catch {
    return { ok: false, json: { error: 'Could not reach the dashboard server.' } };
  }
}

/** Saves a flow through the one save path (validation, engine check, atomic write). */
export async function saveDraft(draft: FlowDraft, opts: { file?: string; onConflict?: 'fail' | 'suffix' } = {}): Promise<SaveOutcome> {
  const r = await send('POST', { draft, ...opts });
  return r.ok && r.json.file ? { ok: true, file: r.json.file } : { ok: false, error: r.json.error ?? 'Could not save the flow.' };
}

export async function deleteFlowFile(file: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await send('DELETE', { file });
  return r.ok ? { ok: true } : { ok: false, error: r.json.error ?? 'Could not delete the flow.' };
}
