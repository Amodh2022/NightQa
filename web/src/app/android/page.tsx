import type { Metadata } from 'next';
import Screen from '@/screens/Android';

export const metadata: Metadata = { title: "NightQA V2 Android and India pack" };

export default function Page() {
  return <div style={{ background: '#070A10', minHeight: '100vh', overflowX: 'auto' }}><Screen /></div>;
}
