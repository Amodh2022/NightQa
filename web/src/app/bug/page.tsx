import type { Metadata } from 'next';
import Screen from '@/screens/Bug';

export const metadata: Metadata = { title: "NightQA Bug and fix PR" };

export default function Page() {
  return <Screen />;
}
