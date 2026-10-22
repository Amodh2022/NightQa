import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { z } from 'zod';
import { readJson, serialize, updateJson } from './store';
import { dataDir } from './paths';

export class VaultError extends Error {
  override readonly name = 'VaultError';
}

const entry = z.object({ iv: z.string(), tag: z.string(), data: z.string() });
const vaultFile = z.object({ version: z.literal(1), salt: z.string(), entries: z.record(z.string(), entry) });
type VaultFile = z.infer<typeof vaultFile>;
const NAME = 'vault.json';
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

/**
 * The key comes from the environment (NIGHTQA_SECRET_KEY, else the sign-in session secret), never from a file next
 * to the data. Without one the vault refuses to store anything: secrets are never written in the clear.
 */
export function vaultKeyMaterial(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const k = env.NIGHTQA_SECRET_KEY ?? env.NIGHTQA_SESSION_SECRET;
  if (!k || k.length < 16) throw new VaultError('Set NIGHTQA_SECRET_KEY (at least 16 characters) to store secrets. Nothing is saved without it.');
  return k;
}

const emptyVault = (): VaultFile => ({ version: 1, salt: randomBytes(16).toString('base64'), entries: {} });
const deriveKey = (material: string, salt: string): Buffer => scryptSync(material, Buffer.from(salt, 'base64'), 32);

export function encryptValue(plain: string, material: string, salt: string): z.infer<typeof entry> {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', deriveKey(material, salt), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function decryptValue(e: z.infer<typeof entry>, material: string, salt: string): string {
  try {
    const d = createDecipheriv('aes-256-gcm', deriveKey(material, salt), Buffer.from(e.iv, 'base64'));
    d.setAuthTag(Buffer.from(e.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(e.data, 'base64')), d.final()]).toString('utf8');
  } catch {
    throw new VaultError('A saved secret could not be decrypted. Was NIGHTQA_SECRET_KEY changed?');
  }
}

function checkName(name: string): void {
  if (!NAME_RE.test(name)) throw new VaultError('Secret names use letters, digits and - _ . : (max 64).');
}

/** Stores (or replaces) a secret, encrypted at rest. */
export async function setSecret(name: string, value: string, dir: string = dataDir(), env: Readonly<Record<string, string | undefined>> = process.env): Promise<void> {
  checkName(name);
  const material = vaultKeyMaterial(env);
  await updateJson(NAME, vaultFile, emptyVault(), (v) => ({ ...v, entries: { ...v.entries, [name]: encryptValue(value, material, v.salt) } }), dir);
}

export async function deleteSecret(name: string, dir: string = dataDir()): Promise<void> {
  checkName(name);
  await updateJson(NAME, vaultFile, emptyVault(), (v) => ({ ...v, entries: Object.fromEntries(Object.entries(v.entries).filter(([k]) => k !== name)) }), dir);
}

/** Names only. Values never leave the server. */
export async function listSecretNames(dir: string = dataDir()): Promise<string[]> {
  return Object.keys((await readJson(NAME, vaultFile, emptyVault(), dir)).entries).sort();
}

export async function hasSecret(name: string, dir: string = dataDir()): Promise<boolean> {
  return (await listSecretNames(dir)).includes(name);
}

/** Decrypts one secret for server-side use (for example to hand a test account to the engine). */
export async function getSecret(name: string, dir: string = dataDir(), env: Readonly<Record<string, string | undefined>> = process.env): Promise<string | undefined> {
  checkName(name);
  const v = await readJson(NAME, vaultFile, emptyVault(), dir);
  const e = v.entries[name];
  return e ? decryptValue(e, vaultKeyMaterial(env), v.salt) : undefined;
}

export { serialize };
