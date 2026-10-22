import { z } from 'zod';

/** Kept free of server-only imports so the browser bundle can use it. */
export const closeReasonSchema = z.enum(['wrong_fix', 'not_a_bug', 'wont_fix']);
export type CloseReason = z.infer<typeof closeReasonSchema>;
export const CLOSE_REASONS: readonly { readonly value: CloseReason; readonly label: string }[] = [
  { value: 'wrong_fix', label: 'Wrong fix' },
  { value: 'not_a_bug', label: 'Not a bug' },
  { value: 'wont_fix', label: 'Won’t fix' },
];
export const closeReasonLabel = (r: CloseReason): string => CLOSE_REASONS.find((c) => c.value === r)?.label ?? r;
