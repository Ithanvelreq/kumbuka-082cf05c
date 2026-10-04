// Flow 4: the doctor asks a spoken question about the record ("when did the fever start?").
// Answers come only from logged entries, must cite entry dates (checked in code), never diagnose or advise,
// and are translated into the call language at the edge. Neither question nor answer is stored.
import { NotFoundError, ServiceBusyError } from "../domain/errors.ts";
import { isGrounded } from "../domain/grounding.ts";
import { decideNeedsReview } from "../domain/needs-review.ts";
import type { AudioInput, HistoryAnswer, PatientStore, Storage, Summarizer, Transcriber } from "../domain/ports.ts";
import type { CallLang } from "../domain/types.ts";
import { clampSms } from "./retrieve.ts";
import { translateOrNull } from "./translate-checked.ts";

export type AskStatus =
  | "answered"
  | "not_recorded" // the record doesn't contain it
  | "out_of_scope" // diagnosis/advice/anything beyond reporting the record
  | "unclear_question" // couldn't hear the question reliably
  | "no_reliable_answer" // model unsure, or answer not grounded in logged entries
  | "empty"; // no entries at all

export interface AskInput {
  patientId: string;
  pin: string;
  callLang: CallLang;
  audio: AudioInput;
}

export interface AskDeps {
  storage: Storage;
  patients: PatientStore;
  transcriber: Transcriber;
  summarizer: Pick<Summarizer, "answerQuestion" | "fromEnglish">;
}

export interface AskResult {
  status: AskStatus;
  /** What we heard, in English (shown to the doctor, never stored). */
  question_en: string;
  /** Only for status "answered". */
  answer: string | null;
  answer_lang: CallLang | null;
  /** The answer cites a day with an unconfirmed entry: the client adds "unclear, ask a person". */
  uses_unconfirmed: boolean;
}

export async function ask(input: AskInput, deps: AskDeps): Promise<AskResult> {
  if (!(await deps.patients.find(input.patientId))) throw new NotFoundError("Unknown patient");

  let transcript;
  try {
    transcript = await deps.transcriber.translateToEnglish(input.audio, input.callLang);
  } finally {
    input.audio.bytes.fill(0); // no audio persisted
  }
  const questionEn = transcript.text_en.trim();
  const result = (status: AskStatus, extra: Partial<AskResult> = {}): AskResult => ({
    status, question_en: questionEn, answer: null, answer_lang: null, uses_unconfirmed: false, ...extra,
  });

  const heard = decideNeedsReview({ segments: transcript.segments, sourceText: questionEn, llmConfidence: null, noteEn: questionEn, parsedOk: true });
  if (heard.needs_review) return result("unclear_question");

  const events = await deps.storage.retrieve(input.patientId, input.pin);
  if (events.length === 0) return result("empty");

  let reply: HistoryAnswer;
  try {
    reply = await deps.summarizer.answerQuestion(events, questionEn);
  } catch (err) {
    if (err instanceof ServiceBusyError) throw err;
    return result("no_reliable_answer");
  }
  if (reply.status !== "answered") return result(reply.status);

  const answerEn = clampSms(reply.answer.trim());
  const entryDays = new Set(events.map((e) => e.created_at.slice(0, 10)));
  if (reply.confidence === "low" || answerEn === "" || !isGrounded(answerEn, entryDays)) return result("no_reliable_answer");

  // Conservative: if any cited day has an unconfirmed entry, flag the answer.
  const unconfirmedDays = new Set(events.filter((e) => e.content.needs_review).map((e) => e.created_at.slice(0, 10)));
  const usesUnconfirmed = [...entryDays].some((d) => unconfirmedDays.has(d) && answerEn.includes(d));

  const translated = await translateOrNull(deps.summarizer, answerEn, input.callLang);
  return result("answered", {
    answer: translated ?? answerEn,
    answer_lang: translated === null ? "en" : input.callLang,
    uses_unconfirmed: usesUnconfirmed,
  });
}
