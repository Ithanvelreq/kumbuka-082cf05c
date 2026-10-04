// Pure needs_review rules (plan section 6, "Confidence and needs_review").
import type { Confidence, TranscriptSegment } from "./types.ts";

// Conservative thresholds: flag readily, a human double-checks.
export const MIN_AVG_LOGPROB = -0.8;
export const MAX_NO_SPEECH_PROB = 0.5;
export const MIN_TRANSCRIPT_CHARS = 8;
export const MIN_TRANSCRIPT_WORDS = 2;

export interface ReviewInput {
  /** Whisper segments; omit for typed text input. */
  segments?: TranscriptSegment[];
  /** Source text the entry was derived from (transcript or typed text). */
  sourceText: string;
  llmConfidence: Confidence | null;
  noteEn: string;
  /** False when LLM JSON parsing/validation failed. */
  parsedOk: boolean;
}

export interface ReviewDecision {
  needs_review: boolean;
  review_reason: string | null;
}

export function decideNeedsReview(input: ReviewInput): ReviewDecision {
  const reasons: string[] = [];

  if (!input.parsedOk) reasons.push("Could not structure the entry");

  if (input.segments) {
    if (input.segments.length === 0) reasons.push("No speech detected");
    if (input.segments.some((s) => s.avg_logprob < MIN_AVG_LOGPROB)) reasons.push("Low transcription confidence");
    if (input.segments.some((s) => s.no_speech_prob > MAX_NO_SPEECH_PROB)) reasons.push("Possible silence or noise");
  }

  if (input.llmConfidence === "low") reasons.push("Model reported low confidence");

  if (input.noteEn.trim() === "") reasons.push("Empty note");

  const text = input.sourceText.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  if (text.length < MIN_TRANSCRIPT_CHARS || words < MIN_TRANSCRIPT_WORDS) reasons.push("Transcript too short");

  return reasons.length > 0
    ? { needs_review: true, review_reason: [...new Set(reasons)].join("; ") }
    : { needs_review: false, review_reason: null };
}

/**
 * Doses and dates must survive translation unchanged: the translation must contain exactly the same numbers,
 * the same number of times (a changed "3 days" -> "8 days" must fail even if a 3 appears elsewhere, e.g. in a
 * date). Values, not spellings: "03" == "3", "1,5" == "1.5". Pure, conservative: false alarms only cost a fallback.
 */
export function numbersPreserved(source: string, translated: string): boolean {
  const nums = (s: string) =>
    (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => String(Number(n.replace(",", ".")))).sort();
  const a = nums(source);
  const b = nums(translated);
  return a.length === b.length && a.every((n, i) => n === b[i]);
}
