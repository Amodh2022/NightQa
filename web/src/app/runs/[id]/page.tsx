import type { Metadata } from 'next';
import RunDetailScreen from '@/screens/live/RunDetailScreen';

export const metadata: Metadata = { title: 'NightQA Run' };

export default async function Page(props: PageProps<'/runs/[id]'>) {
  const { id } = await props.params;
  return <RunDetailScreen id={id} />;
}
