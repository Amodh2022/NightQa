import type { Metadata } from 'next';
import Screen from '@/screens/Import';

export const metadata: Metadata = { title: "NightQA Import from Excel" };

export default function Page() {
  return <Screen />;
}
