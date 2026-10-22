import type { Metadata } from 'next';
import Screen from '@/screens/Reports';

export const metadata: Metadata = { title: "NightQA Notifications" };

export default function Page() {
  return <div style={{ background: '#070A10', minHeight: '100vh', overflowX: 'auto' }}><Screen /></div>;
}
