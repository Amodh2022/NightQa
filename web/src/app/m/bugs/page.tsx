import type { Metadata } from 'next';
import { parseFilter } from '@/lib/bug-view';
import Screen from '@/screens/MBugs';

export const metadata: Metadata = { title: 'NightQA Mobile bugs' };

export default async function Page(props: PageProps<'/m/bugs'>) {
  const q = await props.searchParams;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: '#070A10' }}>
      <Screen filter={parseFilter(q.f)} />
    </div>
  );
}
