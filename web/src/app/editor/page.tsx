import type { Metadata } from 'next';
import Screen from '@/screens/Editor';

export const metadata: Metadata = { title: "NightQA Flow editor" };

export default function Page() {
  return <Screen />;
}
