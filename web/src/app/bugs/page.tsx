import type { Metadata } from 'next';
import Screen from '@/screens/Bugs';

export const metadata: Metadata = { title: "NightQA Bugs board" };

export default function Page() {
  return <Screen />;
}
