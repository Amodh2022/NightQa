import type { Metadata } from 'next';
import BugsScreen from '@/screens/live/BugsScreen';

export const metadata: Metadata = { title: 'NightQA Bugs' };

export default function Page() {
  return <BugsScreen />;
}
