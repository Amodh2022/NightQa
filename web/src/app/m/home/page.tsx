import type { Metadata } from 'next';
import Screen from '@/screens/MHome';

export const metadata: Metadata = { title: "NightQA Mobile morning report" };

export default function Page() {
  return <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: '#070A10' }}><Screen /></div>;
}
