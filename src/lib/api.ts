import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const BUSY = "Service busy, try again";
// Worst case server-side: 2 Groq calls x 2 attempts x 15s (+ short backoffs) ~ 70s.
// Stay above that so we don't report "busy" for a request that then succeeds, but never hang forever.
const CLIENT_TIMEOUT_MS = 90_000;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; status?: number };

export interface AudioPayload {
  base64: string;
  mime_type: string;
}

export interface Patient {
  id: string;
  display_name: string | null;
}

export interface EntryView {
  id: string;
  type: string;
  created_at: string;
  note_en: string;
  needs_review: boolean;
  label: string | null;
  review_reason: string | null;
  transcript_en: string | null;
}

export interface StoredEvent {
  id: string;
  type: string;
  created_at: string;
  content: { note_en: string; needs_review: boolean; review_reason: string | null; details: Record<string, unknown> };
}

async function call<T>(fn: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const invoke = supabase.functions.invoke(fn, { body });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), CLIENT_TIMEOUT_MS));
    const { data, error } = await Promise.race([invoke, timeout]);
    if (!error) return { ok: true, data: data as T };
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      const payload = await res.json().catch(() => null);
      if (res.status === 503 || res.status === 429) return { ok: false, message: BUSY };
      return { ok: false, message: payload?.message ?? "Something went wrong", status: res.status };
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return { ok: false, message: BUSY };
    return { ok: false, message: BUSY };
  } catch {
    return { ok: false, message: BUSY };
  }
}

export type CallLang = "sw" | "en";
export type InstructionType = "doctor_diagnosis" | "doctor_prescription" | "symptom_log";

export interface InboxMessage {
  id: string;
  type: "doctor_diagnosis" | "doctor_prescription";
  created_at: string;
  /** Already in the call language; null = must not be played ("unclear, ask a person"). */
  text: string | null;
  needs_review: boolean;
}

export interface RetrieveResult {
  summary: string;
  empty: boolean;
  fallback: boolean;
  entries: EntryView[];
}

// Every call sends `call_lang`: it only picks the translation models. Storage is always English.
export const api = {
  signup: (id: string, pin: string) => call<{ patient: Patient }>("auth", { action: "signup", id, pin }),
  login: (id: string, pin: string) => call<{ patient: Patient }>("auth", { action: "login", id, pin }),
  ingest: (patient_id: string, pin: string, call_lang: CallLang, audio: AudioPayload) =>
    call<{ event: StoredEvent }>("ingest", { patient_id, pin, call_lang, audio }),
  retrieve: (patient_id: string, pin: string, call_lang: CallLang) =>
    call<RetrieveResult>("retrieve", { patient_id, pin, call_lang }),
  logInstruction: (patient_id: string, pin: string, call_lang: CallLang, type: InstructionType, audio: AudioPayload) =>
    call<{ event: StoredEvent }>("log-instruction", { patient_id, pin, call_lang, type, audio }),
  inbox: (patient_id: string, pin: string, call_lang: CallLang) =>
    call<{ messages: InboxMessage[] }>("inbox", { patient_id, pin, call_lang }),
};
