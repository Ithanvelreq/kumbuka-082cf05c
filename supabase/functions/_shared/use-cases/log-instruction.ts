// Flow 3: doctor speaks on the call -> English transcript (stored as-is) -> event.
// No LLM rewording: Whisper's English output IS the stored text, so nothing can be added or dropped by a model.
// Translation to the patient's language happens at playback (see inbox.ts). Storage is always English.
import { NotFoundError, ValidationError } from "../domain/errors.ts";
import { decideNeedsReview } from "../domain/needs-review.ts";
import type { AudioInput, PatientStore, Storage, Transcriber } from "../domain/ports.ts";
import { validateContent } from "../domain/schema.ts";
import type { CallLang, ContentCore, Event, NewEvent } from "../domain/types.ts";

export const INSTRUCTION_TYPES = ["doctor_diagnosis", "doctor_prescription", "symptom_log"] as const;
export type InstructionType = (typeof INSTRUCTION_TYPES)[number];

export interface LogInstructionInput {
  patientId: string;
  pin: string;
  type: InstructionType;
  /** Language chosen at the start of the call; selects the speech model. */
  callLang: CallLang;
  audio: AudioInput;
}

export interface LogInstructionDeps {
  storage: Storage;
  patients: PatientStore;
  transcriber: Transcriber;
}

export async function logInstruction(input: LogInstructionInput, deps: LogInstructionDeps): Promise<Event> {
  if (!(await deps.patients.find(input.patientId))) throw new NotFoundError("Unknown patient");

  let transcript;
  try {
    transcript = await deps.transcriber.translateToEnglish(input.audio, input.callLang);
  } finally {
    input.audio.bytes.fill(0); // no audio persisted
  }

  const textEn = transcript.text_en.trim();
  const review = decideNeedsReview({
    segments: transcript.segments,
    sourceText: textEn,
    llmConfidence: null, // no LLM in this flow
    noteEn: textEn,
    parsedOk: true,
  });

  const core: ContentCore = {
    note_en: textEn,
    confidence: review.needs_review ? "low" : "high",
    needs_review: review.needs_review,
    review_reason: review.review_reason,
    details: { input: "audio", call_lang: input.callLang },
  };

  const event = (input.type === "symptom_log"
    ? { type: "symptom_log", content: { ...core, reported_by: "doctor" }, source_lang: input.callLang }
    : { type: input.type, content: core, source_lang: input.callLang }) as NewEvent;

  const checked = validateContent(event.type, event.content);
  if (!checked.ok) throw new ValidationError(`Invalid content: ${checked.error}`);
  return deps.storage.store(input.patientId, event, input.pin);
}
