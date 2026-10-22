'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** POSTs a settings change to /api/settings/<section> and refreshes the page data. Errors stay in words. */
export function useSettingsSave(section: 'autonomy' | 'profiles' | 'exploration') {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function save(body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/settings/${section}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Could not save.');
      setSaved(true);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, saved, save };
}
