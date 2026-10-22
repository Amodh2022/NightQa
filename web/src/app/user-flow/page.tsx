import type { Metadata } from 'next';
import Screen from '@/screens/Flow';

export const metadata: Metadata = { title: "NightQA User flow" };

export default function Page() {
  return <div style={{ background: '#070A10', minHeight: '100vh', overflowX: 'auto' }}><Screen /></div>;
}
