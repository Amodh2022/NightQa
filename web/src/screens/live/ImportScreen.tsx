import Link from 'next/link';
import { connection } from 'next/server';
import { ImportWizard } from '@/components/flow-editor/ImportWizard';
import { currentViewer } from '@/lib/auth/server';
import { css } from '@/lib/dc';
import { listAccountNames } from '@/lib/flow-accounts';
import Topbar from '../Topbar';
import { FONT, main } from './ui';

const ACCENT = '#34E3CB';

/** Turn a spreadsheet of test cases into draft flows the user confirms one by one. */
export default async function ImportScreen() {
  await connection();
  const [viewer, accounts] = await Promise.all([currentViewer(), listAccountNames()]);
  return (
    <div style={css(`min-height: 100vh; font-family: ${FONT}; color: #EAF0FA; background: radial-gradient(1000px 520px at 15% -120px, rgba(52,227,203,0.12), transparent 62%), radial-gradient(760px 520px at 92% 14%, rgba(139,124,255,0.12), transparent 62%), #070A10`)}>
      <Topbar active="Flows" accent={ACCENT} />
      <main style={main('32px 40px 64px')}>
        <header>
          <div style={css('font-size: 13.5px; color: #A3AEC2')}>
            <Link href="/flows">Flows</Link> / Import
          </div>
          <h1 style={css('margin: 10px 0 8px; font-size: 42px; font-weight: 800; letter-spacing: -1.6px')}>Turn your Excel test cases into flows</h1>
          <div style={css('font-size: 15.5px; color: #A3AEC2; max-width: 680px; line-height: 1.5')}>
            One row becomes one draft flow. You read and confirm each draft before anything is saved or run.
          </div>
        </header>
        <ImportWizard accounts={accounts} canEdit={viewer?.role === 'member'} />
      </main>
    </div>
  );
}
