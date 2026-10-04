// Storage + PatientStore port implementations. The ONLY module that reads/writes the tables.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { PatientStore, Storage } from "../domain/ports.ts";
import type { Event, NewEvent, Patient } from "../domain/types.ts";

/**
 * DEMO: writes `content` in cleartext and ignores `pin`.
 * Planned: EncryptedStorage derives a key from the PIN (PBKDF2/Argon2), encrypts content before insert,
 * decrypts on read. Same interface, swapped at injection time.
 */
export class PlainStorage implements Storage {
  private db: SupabaseClient;
  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async store(patientId: string, event: NewEvent, _pin: string): Promise<Event> {
    const { data, error } = await this.db
      .from("events")
      .insert({ patient_id: patientId, type: event.type, content: event.content, source_lang: event.source_lang })
      .select()
      .single();
    if (error) throw new Error(`events insert failed: ${error.message}`);
    return data as Event;
  }

  async retrieve(patientId: string, _pin: string): Promise<Event[]> {
    const { data, error } = await this.db
      .from("events")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`events select failed: ${error.message}`);
    return (data ?? []) as Event[];
  }
}

export class SupabasePatientStore implements PatientStore {
  private db: SupabaseClient;
  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async create(patient: Patient): Promise<Patient> {
    const { data, error } = await this.db.from("patients").insert(patient).select().single();
    if (error) throw new Error(`patients insert failed: ${error.message}`);
    return data as Patient;
  }

  async find(id: string): Promise<Patient | null> {
    const { data, error } = await this.db.from("patients").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`patients select failed: ${error.message}`);
    return (data as Patient | null) ?? null;
  }
}
