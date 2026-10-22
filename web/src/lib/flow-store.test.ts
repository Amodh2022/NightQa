import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlowStoreError, deleteFlow, flowPath, readFlowDraft, saveFlow, type EngineCheck } from './flow-store';
import type { FlowDraft } from './flow-yaml';

const draft: FlowDraft = {
  name: 'Checkout with card',
  start: '/products',
  login: '',
  tags: ['critical'],
  steps: [{ text: 'Open the cart', expect: 'cart shows 1 item, total $49.00' }],
  variations: [],
};
const pass: EngineCheck = () => Promise.resolve({ ok: true });
const old = process.env.NIGHTQA_REPO_ROOT;
let root = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nq-store-'));
  await mkdir(join(root, 'flows'));
  process.env.NIGHTQA_REPO_ROOT = root;
});
afterEach(() => {
  if (old === undefined) delete process.env.NIGHTQA_REPO_ROOT;
  else process.env.NIGHTQA_REPO_ROOT = old;
});

describe('flowPath', () => {
  it('stays inside flows/ and only names yaml files', () => {
    expect(flowPath('flows/a.yaml')).toBe(join(root, 'flows', 'a.yaml'));
    for (const bad of ['../x.yaml', 'flows/../../x.yaml', '/etc/passwd.yaml', 'flows/a.txt', 'flows/.hidden.yaml', 'flows/a.yaml\0.txt']) {
      expect(() => flowPath(bad), bad).toThrow(FlowStoreError);
    }
  });
});

describe('saveFlow', () => {
  it('writes flows/<slug>.yaml, loads back, and leaves no temp file', async () => {
    const r = await saveFlow(draft, { check: pass });
    expect(r.file).toBe('flows/checkout-with-card.yaml');
    expect(existsSync(join(root, r.file))).toBe(true);
    expect(readdirSync(join(root, 'flows'))).toEqual(['checkout-with-card.yaml']);
    expect((await readFlowDraft(r.file))?.draft).toEqual(draft);
  });

  it('refuses a taken name, or suffixes it for imports', async () => {
    await saveFlow(draft, { check: pass });
    await expect(saveFlow(draft, { check: pass })).rejects.toMatchObject({ kind: 'exists' });
    expect((await saveFlow(draft, { check: pass, onConflict: 'suffix' })).file).toBe('flows/checkout-with-card-2.yaml');
  });

  it('edits an existing flow in place, even if the name changed', async () => {
    const { file } = await saveFlow(draft, { check: pass });
    await saveFlow({ ...draft, name: 'Renamed' }, { file, check: pass });
    expect((await readFile(join(root, file), 'utf8'))).toContain('flow: Renamed');
    await expect(saveFlow(draft, { file: 'flows/nope.yaml', check: pass })).rejects.toMatchObject({ kind: 'missing' });
  });

  it('rejects invalid flows with the engine messages and writes nothing', async () => {
    await expect(saveFlow({ ...draft, steps: [{ text: 'x', expect: '' }] }, { check: pass })).rejects.toThrow(/at least one "expect:"/);
    expect(readdirSync(join(root, 'flows'))).toEqual([]);
  });

  it('fails closed when the engine check fails, and cleans up', async () => {
    const fail: EngineCheck = () => Promise.resolve({ ok: false, message: 'engine said no' });
    await expect(saveFlow(draft, { check: fail })).rejects.toMatchObject({ kind: 'engine', message: 'engine said no' });
    expect(readdirSync(join(root, 'flows'))).toEqual([]);
  });

  it('refuses to write through a symbolic link', async () => {
    const outside = join(root, 'outside.yaml');
    await writeFile(outside, 'x');
    await symlink(outside, join(root, 'flows', 'checkout-with-card.yaml'));
    await expect(saveFlow(draft, { file: 'flows/checkout-with-card.yaml', check: pass })).rejects.toMatchObject({ kind: 'path' });
    expect(await readFile(outside, 'utf8')).toBe('x');
  });
});

describe('deleteFlow', () => {
  it('deletes inside flows/ only', async () => {
    const { file } = await saveFlow(draft, { check: pass });
    await deleteFlow(file);
    expect(existsSync(join(root, file))).toBe(false);
    await expect(deleteFlow(file)).rejects.toMatchObject({ kind: 'missing' });
    await expect(deleteFlow('../package.yaml')).rejects.toMatchObject({ kind: 'path' });
  });
});
