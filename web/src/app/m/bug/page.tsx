import type { Metadata } from 'next';
import Screen from '@/screens/MBug';

export const metadata: Metadata = { title: 'NightQA Mobile review a fix PR' };

const one = (v: string | string[] | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

export default async function Page(props: PageProps<'/m/bug'>) {
  const q = await props.searchParams;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: '#070A10' }}>
      <Screen run={one(q.run)} id={one(q.id)} />
    </div>
  );
}
