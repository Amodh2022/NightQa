import type { Metadata } from 'next';
import Screen from '@/screens/Runs';

export const metadata: Metadata = { title: "NightQA Runs" };

export default function Page() {
  return <Screen />;
}
