// Ports: interfaces the use cases depend on. Implementations live in ../infra.
import type { CallLang, Confidence, Event, NewEvent, Patient, Transcript } from "./types.ts";

/**
 * Event storage. `pin` is ONLY key material for encrypting content at rest (EncryptedStorage, later).
 * It is never compared against anything, and is unrelated to PinCrypto's login check.
 */
export interface Storage {
  store(patientId: string, event: NewEvent, pin: string): Promise<Event>;
  retrieve(patientId: string, pin: string): Promise<Event[]>;
}

export interface PatientStore {
  create(patient: Patient): Promise<Patient>;
  find(id: string): Promise<Patient | null>;
}

/** Login check without storing the PIN: pin_check = id encrypted with a PIN-derived key. */
export interface PinCrypto {
  encryptCheck(id: string, pin: string): string;
  verifyPin(id: string, pin: string, pinCheck: string): boolean;
}

export interface AudioInput {
  bytes: Uint8Array;
  mimeType: string;
}

/** Speech in the call language -> English text. Implementations must not persist audio. */
export interface Transcriber {
  translateToEnglish(audio: AudioInput, callLang: CallLang): Promise<Transcript>;
}

/** Raw, unvalidated LLM structuring output. The use case validates it. */
export type RawStructured = unknown;

export interface Translation {
  text: string;
  confidence: Confidence | null;
}

export interface Summarizer {
  /** English transcript -> loose JSON with note_en/confidence/details. May throw or return junk. */
  structureSymptom(transcriptEn: string): Promise<RawStructured>;
  /** History -> short summary in English (the pivot language). Translation happens separately, at the edge. */
  summarizeHistory(events: Event[]): Promise<string>;
  /** Stored English text -> call language, for playback. Faithful, nothing added. */
  fromEnglish(textEn: string, callLang: CallLang): Promise<Translation>;
}
