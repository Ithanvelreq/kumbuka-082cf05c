// In-memory port fakes for use-case tests.
import type { EntryMeta, HistoryAnswer, PatientStore, Storage, Summarizer, Transcriber, Translation } from "../supabase/functions/_shared/domain/ports.ts";
import type { CallLang, Event, NewEvent, Patient, Transcript } from "../supabase/functions/_shared/domain/types.ts";

export class MemoryStorage implements Storage {
  events: Event[] = [];
  async store(patientId: string, event: NewEvent): Promise<Event> {
    const e = { ...event, id: `e${this.events.length + 1}`, patient_id: patientId, created_at: new Date(2026, 9, this.events.length + 1).toISOString() } as Event;
    this.events.push(e);
    return e;
  }
  async retrieve(patientId: string): Promise<Event[]> {
    return this.events.filter((e) => e.patient_id === patientId);
  }
}

export class MemoryPatients implements PatientStore {
  rows = new Map<string, Patient>();
  async create(p: Patient) {
    if (this.rows.has(p.id)) throw new Error("duplicate");
    this.rows.set(p.id, p);
    return p;
  }
  async find(id: string) {
    return this.rows.get(id) ?? null;
  }
  entryMeta = new Map<string, EntryMeta[]>();
  async listWithEntryMeta() {
    return [...this.rows.values()].map((patient) => ({ patient, entries: this.entryMeta.get(patient.id) ?? [] }));
  }
}

export class FakeTranscriber implements Transcriber {
  seenBytes: Uint8Array | null = null;
  result: Transcript | Error;
  constructor(result: Transcript | Error) {
    this.result = result;
  }
  async translateToEnglish(audio: { bytes: Uint8Array }) {
    this.seenBytes = audio.bytes;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

export class FakeSummarizer implements Summarizer {
  calls: { method: string; args: unknown[] }[] = [];
  responses: { structure?: unknown; summary?: string; translation?: Translation | Error; answer?: HistoryAnswer | Error };
  constructor(responses: FakeSummarizer["responses"] = {}) {
    this.responses = responses;
  }
  async structureSymptom(t: string) {
    this.calls.push({ method: "structureSymptom", args: [t] });
    const r = this.responses.structure;
    if (r instanceof Error) throw r;
    return r;
  }
  async summarizeHistory(events: Event[]) {
    this.calls.push({ method: "summarizeHistory", args: [events] });
    return this.responses.summary ?? "summary";
  }
  async answerQuestion(events: Event[], questionEn: string) {
    this.calls.push({ method: "answerQuestion", args: [events, questionEn] });
    const r = this.responses.answer;
    if (r instanceof Error) throw r;
    return r ?? { status: "not_recorded" as const, answer: "", confidence: "high" as const };
  }
  async fromEnglish(text: string, lang: CallLang) {
    this.calls.push({ method: "fromEnglish", args: [text, lang] });
    const r = this.responses.translation;
    if (r instanceof Error) throw r;
    return r ?? { text, confidence: "high" as const };
  }
}
