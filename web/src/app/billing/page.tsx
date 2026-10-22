import type { Metadata } from 'next';
import Screen from '@/screens/Billing';

export const metadata: Metadata = { title: "NightQA Usage and billing" };

export default function Page() {
  return <Screen />;
}
