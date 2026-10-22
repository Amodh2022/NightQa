import type { Metadata } from 'next';
import EditorScreen from '@/screens/live/EditorScreen';

export const metadata: Metadata = { title: 'NightQA Flow editor' };

export default async function Page({ searchParams }: PageProps<'/editor'>) {
  const f = (await searchParams).file;
  return <EditorScreen {...(typeof f === 'string' ? { file: f } : {})} />;
}
