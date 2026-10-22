import type { Metadata } from 'next';
import Screen from '@/screens/Run';

export const metadata: Metadata = { title: "NightQA Run detail" };

export default function Page() {
  return <Screen />;
}
