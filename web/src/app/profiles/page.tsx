import type { Metadata } from 'next';
import Screen from '@/screens/Profiles';

export const metadata: Metadata = { title: "NightQA Network and screen profiles" };

export default function Page() {
  return <Screen />;
}
