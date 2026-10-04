// Demo-only overview of all patients: number, name, history length, languages used.
// Switched off unless the deployment enables it, because today the patient number is the only thing
// protecting a record (the PIN isn't checked yet). In the intended design (PIN-derived encryption)
// a list like this would reveal nothing readable.
import { ForbiddenError } from "../domain/errors.ts";
import type { EntryMeta, PatientStore } from "../domain/ports.ts";
import { type CallLang, isCallLang } from "../domain/types.ts";

export interface PatientOverview {
  id: string;
  display_name: string | null;
  registered_at: string | null;
  /** Length of the history: number of logged entries of any kind. */
  entries: number;
  first_entry_at: string | null;
  last_entry_at: string | null;
  /**
   * Call languages the patient used for their own recordings, most recent first. Patients have no stored
   * language (storage is English; the language is chosen per call); doctor entries are left out because
   * they reflect the doctor's call.
   */
  languages: CallLang[];
}

export async function listPatients(input: { enabled: boolean }, deps: { patients: PatientStore }): Promise<PatientOverview[]> {
  if (!input.enabled) throw new ForbiddenError("The patient list is a demo-only view and is switched off");
  const rows = await deps.patients.listWithEntryMeta();
  return rows.map(({ patient, entries }) => {
    const byDate = [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return {
      id: patient.id,
      display_name: patient.display_name,
      registered_at: patient.created_at ?? null,
      entries: entries.length,
      first_entry_at: byDate[0]?.created_at ?? null,
      last_entry_at: byDate.at(-1)?.created_at ?? null,
      languages: patientLanguages(byDate),
    };
  });
}

function patientLanguages(byDate: EntryMeta[]): CallLang[] {
  const own = byDate.filter((e) => e.type === "symptom_log" && e.reported_by !== "doctor");
  const langs: CallLang[] = [];
  for (const e of [...own].reverse()) {
    if (isCallLang(e.source_lang) && !langs.includes(e.source_lang)) langs.push(e.source_lang);
  }
  return langs;
}
