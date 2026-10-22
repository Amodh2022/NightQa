import type { Metadata } from 'next';
import Screen from '@/screens/Setup';

export const metadata: Metadata = { title: "NightQA Setup" };

export default function Page() {
  return <Screen />;
}
