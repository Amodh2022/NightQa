import type { Metadata } from 'next';
import Screen from '@/screens/Explore';

export const metadata: Metadata = { title: "NightQA Exploration" };

export default function Page() {
  return <Screen />;
}
