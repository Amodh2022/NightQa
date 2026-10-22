import type { Metadata } from 'next';
import FlowsScreen from '@/screens/live/FlowsScreen';

export const metadata: Metadata = { title: 'NightQA Flows' };

export default function Page() {
  return <FlowsScreen />;
}
