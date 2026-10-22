/** Lower-cases and collapses whitespace so page text can be compared the way a person reads it. */
export function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** True when `snippet` appears in `pageText`, ignoring case and whitespace differences. */
export function containsText(pageText: string, snippet: string): boolean {
  return normalizeText(pageText).includes(normalizeText(snippet));
}
