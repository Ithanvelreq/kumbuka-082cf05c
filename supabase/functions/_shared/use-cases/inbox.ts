// Playback of doctor messages to the patient. Stored text is English; it is translated into the call
// language only now, at the edge. Anything uncertain is returned as unclear instead of a possibly wrong text.
import { NotFoundError, ServiceBusyError } from "../domain/errors.ts";
import { numbersPreserved } from "../domain/needs-review.ts";
import type { PatientStore, Storage, Summarizer } from "../domain/ports.ts";
import type { CallLang, Event } from "../domain/types.ts";

export interface InboxMessage {
  id: string;
  type: "doctor_diagnosis" | "doctor_prescription";
  created_at: string;
  /** Message in the call language, or null when it must not be played (client says "unclear, ask a person"). */
  text: string | null;
  needs_review: boolean;
}

export interface InboxDeps {
  storage: Storage;
  patients: PatientStore;
  summarizer: Pick<Summarizer, "fromEnglish">;
}

export async function inbox(input: { patientId: string; pin: string; callLang: CallLang }, deps: InboxDeps): Promise<InboxMessage[]> {
  if (!(await deps.patients.find(input.patientId))) throw new NotFoundError("Unknown patient");
  const events = (await deps.storage.retrieve(input.patientId, input.pin)).filter(isDoctorMessage);

  const out: InboxMessage[] = [];
  for (const e of events) {
    const base = { id: e.id, type: e.type, created_at: e.created_at };
    const textEn = e.content.note_en.trim();
    if (e.content.needs_review || textEn === "") {
      out.push({ ...base, text: null, needs_review: true });
      continue;
    }
    if (input.callLang === "en") {
      out.push({ ...base, text: textEn, needs_review: false });
      continue;
    }
    let text: string | null = null;
    try {
      const tr = await deps.summarizer.fromEnglish(textEn, input.callLang);
      const ok = tr.confidence !== "low" && tr.text.trim() !== "" && numbersPreserved(textEn, tr.text);
      text = ok ? tr.text.trim() : null;
    } catch (err) {
      if (err instanceof ServiceBusyError) throw err;
    }
    out.push({ ...base, text, needs_review: text === null });
  }
  return out;
}

function isDoctorMessage(e: Event): e is Event & { type: InboxMessage["type"] } {
  return e.type === "doctor_diagnosis" || e.type === "doctor_prescription";
}
