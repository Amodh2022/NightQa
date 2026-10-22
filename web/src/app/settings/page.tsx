import type { Metadata } from 'next';
import Screen from '@/screens/Settings';

export const metadata: Metadata = { title: "NightQA Settings" };

export default function Page() {
  return <Screen />;
}
