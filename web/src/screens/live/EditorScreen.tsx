import Link from 'next/link';
import { connection } from 'next/server';
import { FlowEditor } from '@/components/flow-editor/FlowEditor';
import { currentViewer } from '@/lib/auth/server';
import { css } from '@/lib/dc';
import { listAccountNames } from '@/lib/flow-accounts';
import { FlowStoreError, readFlowDraft } from '@/lib/flow-store';
import { emptyDraft } from '@/lib/flow-yaml';
import { listFlows } from '@/lib/flows';
import { formatUsd } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import Topbar from '../Topbar';
import { emptyCard, FONT, main, MONO } from './ui';

const ACCENT = '#34E3CB';

/** Create a flow, or edit one from flows/. `file` is the repo-relative name, e.g. flows/checkout.yaml. */
export default async function EditorScreen({ file }: { file?: string }) {
  await connection();
  const [viewer, accounts, settings, flows] = await Promise.all([currentViewer(), listAccountNames(), getSettings(), listFlows()]);
  const { maxSteps, maxSeconds, maxCostUsd } = settings.budgets;
  const budgetLine = `Budget per run: ${String(maxSteps)} steps, ${String(Math.round(maxSeconds / 60))} minutes, ${formatUsd(maxCostUsd)}. Going over ends the run as Agent stuck, never as Pass.`;

  let loaded: Awaited<ReturnType<typeof readFlowDraft>>;
  let problem: string | undefined;
  if (file) {
    try {
      loaded = await readFlowDraft(file);
      if (!loaded) problem = 'That flow file does not exist or cannot be read as a flow.';
    } catch (e) {
      if (!(e instanceof FlowStoreError)) throw e;
      problem = e.message;
    }
  }

  return (
    <div style={css(`min-height: 100vh; font-family: ${FONT}; color: #EAF0FA; background: radial-gradient(1000px 520px at 85% -120px, rgba(139,124,255,0.13), transparent 62%), radial-gradient(760px 520px at 4% 12%, rgba(52,227,203,0.10), transparent 62%), #070A10`)}>
      <Topbar active="Flows" accent={ACCENT} />
      <main style={main('32px 40px 64px')}>
        {problem ? (
          <div style={emptyCard}>
            <div style={css('font-size: 20px; font-weight: 800')}>Cannot open this flow</div>
            <div style={css('font-size: 14.5px; color: #A3AEC2; max-width: 520px; line-height: 1.5; overflow-wrap: anywhere')}>{problem}</div>
            <Link href="/flows" style={css(`font-size: 14px; font-weight: 800; color: ${ACCENT}`)}>Back to flows</Link>
          </div>
        ) : (
          <FlowEditor
            initial={loaded?.draft ?? emptyDraft()}
            {...(loaded ? { file: loaded.file } : {})}
            hasSavedTest={flows.find((f) => f.file === loaded?.file)?.hasSavedTest ?? false}
            accounts={accounts}
            canEdit={viewer?.role === 'member'}
            budgetLine={budgetLine}
          />
        )}
        <div style={css(`font-size: 12px; color: #6F7C94; font-family: ${MONO}`)}>Saved flows are plain YAML files in flows/. Review them like code.</div>
      </main>
    </div>
  );
}
