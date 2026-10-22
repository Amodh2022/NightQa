import { draftToYaml, type FlowDraft } from './flow-yaml';
import { validateFlowSource, type Validation } from './flow-validate';

export interface DraftCheck {
  readonly yaml: string;
  readonly validation: Validation;
  readonly errorLines: ReadonlySet<number>;
  readonly warnLines: ReadonlySet<number>;
}

/** The YAML a draft would be saved as, checked with the engine's rules. Runs on every keystroke, so it stays pure. */
export function checkDraft(draft: FlowDraft): DraftCheck {
  const yaml = draftToYaml(draft);
  const validation = validateFlowSource(yaml);
  return {
    yaml,
    validation,
    errorLines: new Set(validation.ok ? [] : validation.issues.map((i) => i.line)),
    warnLines: new Set(validation.ok ? validation.warnings.map((w) => w.line) : []),
  };
}
