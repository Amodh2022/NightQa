import type { Metadata } from 'next';
import Screen from '@/screens/Topbar';

export const metadata: Metadata = { title: "NightQA Top navigation" };

export default function Page() {
  return <div style={{ background: '#070A10', minHeight: '100vh', overflowX: 'auto' }}><Screen /></div>;
}
