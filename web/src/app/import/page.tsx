import type { Metadata } from 'next';
import ImportScreen from '@/screens/live/ImportScreen';

export const metadata: Metadata = { title: 'NightQA Import from Excel' };

export default function Page() {
  return <ImportScreen />;
}
