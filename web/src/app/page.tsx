import type { Metadata } from 'next';
import OverviewScreen from '@/screens/live/OverviewScreen';

export const metadata: Metadata = { title: 'NightQA Overview' };

export default function Page() {
  return <OverviewScreen />;
}
