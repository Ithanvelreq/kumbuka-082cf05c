// Signup + login check (ID + PIN). DEMO: wired with NoOpPinCrypto, so login only checks the ID exists.
import { NotFoundError, ValidationError } from "../domain/errors.ts";
import type { PatientStore, PinCrypto } from "../domain/ports.ts";

export interface AuthDeps {
  patients: PatientStore;
  pinCrypto: PinCrypto;
}

export interface PublicPatient {
  id: string;
  display_name: string | null;
}

// Typed on a phone keypad, so the patient number is digits only.
const ID_RE = /^\d{3,15}$/;
const PIN_RE = /^\d{4,6}$/;

function checkCredentials(id: string, pin: string) {
  if (!ID_RE.test(id)) throw new ValidationError("Patient number must be 3-15 digits");
  if (!PIN_RE.test(pin)) throw new ValidationError("PIN must be 4-6 digits");
}

export async function signup(input: { id: string; pin: string; displayName: string | null }, deps: AuthDeps): Promise<PublicPatient> {
  const id = input.id.toLowerCase();
  checkCredentials(id, input.pin);
  if (await deps.patients.find(id)) throw new ValidationError("This ID is already taken");
  const p = await deps.patients.create({ id, display_name: input.displayName, pin_check: deps.pinCrypto.encryptCheck(id, input.pin) });
  return { id: p.id, display_name: p.display_name };
}

export async function login(input: { id: string; pin: string }, deps: AuthDeps): Promise<PublicPatient> {
  const id = input.id.toLowerCase();
  checkCredentials(id, input.pin);
  const p = await deps.patients.find(id);
  if (!p) throw new NotFoundError("Unknown ID");
  if (!deps.pinCrypto.verifyPin(id, input.pin, p.pin_check ?? "")) throw new ValidationError("Wrong PIN");
  return { id: p.id, display_name: p.display_name };
}
