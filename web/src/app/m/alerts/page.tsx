import type { Metadata } from 'next';
import Screen from '@/screens/MAlerts';

export const metadata: Metadata = { title: "NightQA Mobile alerts" };

export default function Page() {
  return <div style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: '#070A10' }}><Screen /></div>;
}
