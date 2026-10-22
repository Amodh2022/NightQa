'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-reads the page's data every few seconds while a run is in progress. Renders nothing. */
export function AutoRefresh({ active, everyMs = 2500 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      router.refresh();
    }, everyMs);
    return () => {
      clearInterval(t);
    };
  }, [active, everyMs, router]);
  return null;
}
