import type { Metadata } from 'next';
import Screen from '@/screens/Main';

export const metadata: Metadata = { title: "NightQA Overview" };

export default function Page() {
  return <Screen />;
}
