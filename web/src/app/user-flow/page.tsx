import type { Metadata } from 'next';
import UserFlowScreen from '@/screens/live/UserFlowScreen';

export const metadata: Metadata = { title: 'NightQA User flow' };

export default function Page() {
  return (
    <div style={{ background: '#070A10', minHeight: '100vh', overflowX: 'auto' }}>
      <UserFlowScreen />
    </div>
  );
}
