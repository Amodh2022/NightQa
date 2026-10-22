import type { Metadata } from 'next';
import Screen from '@/screens/MSetup';

export const metadata: Metadata = { title: 'NightQA Mobile setup' };

export default async function Page({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  const { step } = await searchParams;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: '#070A10' }}>
      <Screen {...(typeof step === 'string' ? { step } : {})} />
    </div>
  );
}
