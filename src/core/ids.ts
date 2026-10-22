import { ulid } from 'ulid';

/** Creates a sortable unique id for one run. Used as the correlation id in logs and result folders. */
export function newRunId(): string {
  return ulid();
}
