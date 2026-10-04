// Flow 2: patient id -> all (English) events -> short English summary -> translated into the call language at the
// edge (same check as message playback), read to the doctor. If the translation can't be trusted, the doctor
// hears the English summary instead of a possibly wrong one.
import { NotFoundError, ServiceBusyError } from "../domain/errors.ts";
import type { PatientStore, Storage, Summarizer } from "../domain/ports.ts";
import { type CallLang, type Event, UNCLEAR_LABEL } from "../domain/types.ts";
import { translateOrNull } from "./translate-checked.ts";

/** ~20 seconds of reading. Longer model output is cut at a word boundary. */
export const SMS_MAX_CHARS = 320;
export const EMPTY_HISTORY = "No entries yet";

export interface RetrieveInput {
  patientId: string;
  pin: string;
  targetLang: CallLang;
}

export interface RetrieveDeps {
  storage: Storage;
  patients: PatientStore;
  summarizer: Pick<Summarizer, "summarizeHistory" | "fromEnglish">;
}

export interface EntryView {
  id: string;
  type: Event["type"];
  created_at: string;
  note_en: string;
  needs_review: boolean;
  /** UNCLEAR_LABEL when flagged, so every client renders the same fail-safe text. */
  label: string | null;
  review_reason: string | null;
  transcript_en: string | null;
}

export interface RetrieveResult {
  summary: string;
  /** Language `summary` is in. Differs from the call language when translation wasn't trustworthy. */
  summary_lang: CallLang;
  /** True when there are no entries; the client says "No entries yet" in the call language. */
  empty: boolean;
  /** True when the LLM failed and we fell back to a plain English list. */
  fallback: boolean;
  entries: EntryView[];
}

export async function retrieve(input: RetrieveInput, deps: RetrieveDeps): Promise<RetrieveResult> {
  if (!(await deps.patients.find(input.patientId))) throw new NotFoundError("Unknown patient");

  const events = await deps.storage.retrieve(input.patientId, input.pin);
  const entries = events.map(toView);
  if (events.length === 0) return { summary: EMPTY_HISTORY, summary_lang: "en", empty: true, fallback: false, entries };

  let summaryEn: string;
  try {
    summaryEn = clampSms((await deps.summarizer.summarizeHistory(events)).trim());
    if (summaryEn === "") throw new Error("empty summary");
  } catch (err) {
    if (err instanceof ServiceBusyError) throw err;
    return { summary: clampSms(fallbackSummary(entries)), summary_lang: "en", empty: false, fallback: true, entries };
  }

  if (input.targetLang === "en") return { summary: summaryEn, summary_lang: "en", empty: false, fallback: false, entries };
  const translated = await translateOrNull(deps.summarizer, summaryEn, input.targetLang);
  return translated === null
    ? { summary: summaryEn, summary_lang: "en", empty: false, fallback: false, entries }
    : { summary: clampSms(translated), summary_lang: input.targetLang, empty: false, fallback: false, entries };
}

function toView(e: Event): EntryView {
  const t = e.content.details?.transcript_en;
  return {
    id: e.id,
    type: e.type,
    created_at: e.created_at,
    note_en: e.content.note_en,
    needs_review: e.content.needs_review,
    label: e.content.needs_review ? UNCLEAR_LABEL : null,
    review_reason: e.content.review_reason,
    transcript_en: typeof t === "string" ? t : null,
  };
}

/** Deterministic, English-only: newest first, unconfirmed entries marked. */
function fallbackSummary(entries: EntryView[]): string {
  return [...entries]
    .reverse()
    .map((e) => `${e.created_at.slice(0, 10)}: ${e.needs_review ? `(unconfirmed) ${e.note_en || UNCLEAR_LABEL}` : e.note_en}`)
    .join(" | ");
}

export function clampSms(text: string, max = SMS_MAX_CHARS): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
