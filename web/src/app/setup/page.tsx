import type { Metadata } from 'next';
import Screen from '@/screens/Setup';

export const metadata: Metadata = { title: 'NightQA Setup' };

export default async function Page({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  const { step } = await searchParams;
  return <Screen {...(typeof step === 'string' ? { step } : {})} />;
}
