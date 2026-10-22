import type { Metadata } from 'next';
import Screen from '@/screens/Reports';

export const metadata: Metadata = { title: 'NightQA Notifications' };

export default function Page() {
  return <Screen />;
}
