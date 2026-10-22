import type { Metadata } from 'next';
import Screen from '@/screens/MRun';

export const metadata: Metadata = { title: 'NightQA Mobile run replay' };

const one = (v: string | string[] | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

export default async function Page(props: PageProps<'/m/run'>) {
  const q = await props.searchParams;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: '#070A10' }}>
      <Screen id={one(q.id)} />
    </div>
  );
}
