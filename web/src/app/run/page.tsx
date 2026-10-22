import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { listRuns } from '@/lib/results';

/** The design's single "Run detail" link: open the latest run, or the run list when there is none. */
export default async function Page() {
  await connection();
  const latest = (await listRuns())[0];
  redirect(latest ? `/runs/${latest.id}` : '/runs');
}
