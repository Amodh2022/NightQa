import type { Metadata } from 'next';
import Screen from '@/screens/Flows';

export const metadata: Metadata = { title: "NightQA Flows" };

export default function Page() {
  return <Screen />;
}
