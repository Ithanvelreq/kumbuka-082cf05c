// Domain model. Pure types: no I/O, no Supabase/Groq/Deno imports.

export type Confidence = "high" | "medium" | "low";

/**
 * Languages the call menu offers (1 Swahili, 2 English, 3 Spanish, 4 Russian).
 * Storage is ALWAYS English. The call language only selects which models translate at the edges.
 */
export const CALL_LANGS = ["sw", "en", "es", "ru"] as const;
export type CallLang = (typeof CALL_LANGS)[number];

export function isCallLang(v: unknown): v is CallLang {
  return typeof v === "string" && (CALL_LANGS as readonly string[]).includes(v);
}

export const EVENT_TYPES = ["symptom_log", "doctor_diagnosis", "doctor_prescription", "lab_result"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface Patient {
  id: string;
  display_name: string | null;
  pin_check: string | null;
  created_at?: string;
}

/** Fixed core shared by every content shape. */
export interface ContentCore {
  note_en: string;
  confidence: Confidence;
  needs_review: boolean;
  review_reason: string | null;
  details: Record<string, unknown>;
}

export interface SymptomLogContent extends ContentCore {
  reported_by: "patient" | "doctor";
}

export type DoctorDiagnosisContent = ContentCore;
export type DoctorPrescriptionContent = ContentCore;

export interface LabResultContent extends ContentCore {
  test_name: string | null;
  result_value: string | null;
}

export interface ContentByType {
  symptom_log: SymptomLogContent;
  doctor_diagnosis: DoctorDiagnosisContent;
  doctor_prescription: DoctorPrescriptionContent;
  lab_result: LabResultContent;
}

export type NewEvent = {
  [T in EventType]: { type: T; content: ContentByType[T]; source_lang: string | null };
}[EventType];

export type Event = NewEvent & { id: string; patient_id: string; created_at: string };

/** Per-segment confidence signals from the speech model. */
export interface TranscriptSegment {
  avg_logprob: number;
  no_speech_prob: number;
}

export interface Transcript {
  /** English text (Whisper translate). */
  text_en: string;
  segments: TranscriptSegment[];
}

/** Shown to users whenever an entry is flagged. */
export const UNCLEAR_LABEL = "Unclear, ask a person";
