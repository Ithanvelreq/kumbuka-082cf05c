// Pure grounding checks for answers about a patient's record.

/** All YYYY-MM-DD dates mentioned in a text. */
export function citedDates(text: string): string[] {
  return [...new Set(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])];
}

/**
 * An answer is grounded when it cites at least one date and every cited date is a day with a logged entry.
 * Cheap and conservative: it can't prove the content is right, but it catches invented or misremembered entries.
 */
export function isGrounded(answer: string, entryDays: Set<string>): boolean {
  const dates = citedDates(answer);
  return dates.length > 0 && dates.every((d) => entryDays.has(d));
}
