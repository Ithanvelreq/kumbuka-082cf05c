// Flow 1: patient audio (call language) -> English transcript -> structured symptom_log -> needs_review -> store.
import { NotFoundError, ServiceBusyError, ValidationError } from "../domain/errors.ts";
import { decideNeedsReview } from "../domain/needs-review.ts";
import type { AudioInput, PatientStore, Storage, Summarizer, Transcriber } from "../domain/ports.ts";
import { coerceCore, validateContent } from "../domain/schema.ts";
import type { CallLang, Event, SymptomLogContent } from "../domain/types.ts";

export interface IngestInput {
  patientId: string;
  pin: string;
  audio: AudioInput;
  sourceLang: CallLang;
}

export interface IngestDeps {
  storage: Storage;
  patients: PatientStore;
  transcriber: Transcriber;
  summarizer: Pick<Summarizer, "structureSymptom">;
}

export async function ingest(input: IngestInput, deps: IngestDeps): Promise<Event> {
  if (!(await deps.patients.find(input.patientId))) throw new NotFoundError("Unknown patient");

  let transcript;
  try {
    transcript = await deps.transcriber.translateToEnglish(input.audio, input.sourceLang);
  } finally {
    // No audio persisted: wipe the in-memory buffer as soon as transcription is done (or failed).
    input.audio.bytes.fill(0);
  }

  let raw: unknown = null;
  let parsedOk = true;
  if (transcript.text_en.trim() !== "") {
    try {
      raw = await deps.summarizer.structureSymptom(transcript.text_en);
    } catch (err) {
      if (err instanceof ServiceBusyError) throw err;
      parsedOk = false; // bad JSON etc.: record as unclear, never guess
    }
  }
  const core = coerceCore(raw);
  if (raw !== null && !core) parsedOk = false;

  const noteEn = core?.note_en ?? "";
  const llmConfidence = core?.confidence ?? "low";
  const review = decideNeedsReview({
    segments: transcript.segments,
    sourceText: transcript.text_en,
    llmConfidence,
    noteEn,
    parsedOk,
  });

  const content: SymptomLogContent = {
    reported_by: "patient",
    note_en: noteEn,
    confidence: review.needs_review && llmConfidence === "high" ? "medium" : llmConfidence,
    needs_review: review.needs_review,
    review_reason: review.review_reason,
    // English transcript kept so a clinician can read what was actually said when the entry is unclear.
    details: { ...(core?.details ?? {}), transcript_en: transcript.text_en },
  };

  const checked = validateContent("symptom_log", content);
  if (!checked.ok) throw new ValidationError(`Invalid content: ${checked.error}`);

  return deps.storage.store(input.patientId, { type: "symptom_log", content: checked.value, source_lang: input.sourceLang }, input.pin);
}
