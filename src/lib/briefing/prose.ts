/**
 * Spoken times end in a period — "4:30 p.m." — so appending one to finish the
 * sentence produces "4:30 p.m..", which a speech engine reads as a stumble.
 */
export function endSentence(text: string): string {
  return /[.!?]$/.test(text.trimEnd()) ? text.trimEnd() : `${text.trimEnd()}.`;
}
