import type { Metadata } from 'next';
import Screen from '@/screens/Landing';

export const metadata: Metadata = { title: "NightQA Landing page" };

export default function Page() {
  return <Screen />;
}
