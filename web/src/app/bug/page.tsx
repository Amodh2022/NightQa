import type { Metadata } from 'next';
import Screen from '@/screens/Bug';

export const metadata: Metadata = { title: 'NightQA Bug and fix PR' };

const one = (v: string | string[] | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

export default async function Page(props: PageProps<'/bug'>) {
  const q = await props.searchParams;
  return <Screen run={one(q.run)} id={one(q.id)} />;
}
