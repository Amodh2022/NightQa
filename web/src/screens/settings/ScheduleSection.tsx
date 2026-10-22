import { ScheduleForm } from './ScheduleForm';
import { Section, note } from './shared';
import type { DashboardState } from './state';

export function ScheduleSection({ s }: { s: DashboardState }) {
  const { settings } = s;
  return (
    <Section id="schedule" title="Schedule and limits">
      <ScheduleForm
        initial={{ schedule: settings.schedule, budgets: settings.budgets, maxFixPerNight: settings.github.maxFixPerNight, explorationMaxSteps: settings.exploration.maxSteps }}
        readOnly={s.readOnly}
      />
      <div style={note}>
        The limits apply to every run the dashboard starts. The nightly schedule is saved here, but nothing in the dashboard starts runs by itself yet: use Run now, or call the engine from your own cron or CI.
      </div>
    </Section>
  );
}
