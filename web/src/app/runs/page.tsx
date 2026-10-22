import type { Metadata } from 'next';
import RunsScreen from '@/screens/live/RunsScreen';

export const metadata: Metadata = { title: 'NightQA Runs' };

export default async function Page({ searchParams }: PageProps<'/runs'>) {
  const v = (await searchParams).v;
  return <RunsScreen filter={typeof v === 'string' ? v : 'all'} />;
}
