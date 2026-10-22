import type { Metadata } from 'next';
import Screen from '@/screens/Tokens';

export const metadata: Metadata = { title: "NightQA Design tokens and components" };

export default function Page() {
  return <div style={{ background: '#070A10', minHeight: '100vh', overflowX: 'auto' }}><Screen /></div>;
}
