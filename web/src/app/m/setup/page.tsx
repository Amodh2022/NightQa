import type { Metadata } from 'next';
import Screen from '@/screens/MSetup';

export const metadata: Metadata = { title: "NightQA Mobile setup" };

export default function Page() {
  return <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: '#070A10' }}><Screen /></div>;
}
