// Keypad call menu as a pure state machine (no React, no network) so it can be tested with node.
// The component executes the returned `effect` and feeds the outcome back via the `after*` functions.
// The language choice only selects which translation models the backend uses; storage is always English.

export type Lang = "sw" | "en";
export type Role = "patient" | "doctor";
export type RecordKind = "symptom" | "doctor_diagnosis" | "doctor_prescription" | "symptom_log";

export type Step =
  | "idle"
  | "lang"
  | "number"
  | "pin"
  | "not_found"
  | "role"
  | "patient_menu"
  | "doctor_menu"
  | "record"
  | "working";

export interface CallState {
  step: Step;
  lang: Lang;
  role: Role | null;
  number: string;
  pin: string;
  /** Digits typed so far for the current number/PIN entry. */
  digits: string;
  recordKind: RecordKind | null;
}

export type Effect =
  | { type: "login" }
  | { type: "register" }
  | { type: "retrieve" }
  | { type: "inbox" }
  | { type: "send_audio"; kind: RecordKind };

export interface Transition {
  state: CallState;
  /** Lines the voice says, in order. */
  say: string[];
  effect?: Effect;
}

// TODO before a real pilot: have a native Swahili speaker review these prompts.
const PROMPTS = {
  number: { sw: "Weka namba ya mgonjwa, kisha bonyeza #.", en: "Enter the patient number, then press #." },
  pin: { sw: "Weka PIN, kisha bonyeza #.", en: "Enter the PIN, then press #." },
  not_found: {
    sw: "Namba hii haijasajiliwa. Bonyeza 1 kujisajili kwa PIN hii. Bonyeza 2 kujaribu tena.",
    en: "This number is not registered. Press 1 to register with this PIN. Press 2 to try again.",
  },
  role: {
    sw: "Kama wewe ni mgonjwa, bonyeza 1. Kama wewe ni daktari, bonyeza 2.",
    en: "If you are the patient, press 1. If you are the doctor, press 2.",
  },
  patient_menu: {
    sw: "Bonyeza 1 kurekodi dalili. Bonyeza 2 kusikiliza ujumbe wa daktari.",
    en: "Press 1 to record a symptom. Press 2 to hear messages from your doctor.",
  },
  doctor_menu: {
    sw: "Bonyeza 1 kusikiliza historia ya mgonjwa. Bonyeza 2 kurekodi utambuzi. Bonyeza 3 kurekodi dawa. Bonyeza 4 kurekodi maelezo ya mazungumzo.",
    en: "Press 1 to hear the patient's history. Press 2 to record a diagnosis. Press 3 to record a prescription. Press 4 to record a consultation note.",
  },
  record: { sw: "Ongea baada ya mlio. Bonyeza * kurudi.", en: "Speak after the beep. Press * to go back." },
  invalid: { sw: "Chaguo si sahihi.", en: "Invalid choice." },
  too_short: { sw: "Namba fupi mno.", en: "Too short." },
  registered: { sw: "Umesajiliwa.", en: "You are registered." },
  saved: { sw: "Imehifadhiwa.", en: "Saved." },
  saved_unclear: {
    sw: "Imehifadhiwa, lakini haikueleweka vizuri. Mtu ataikagua.",
    en: "Saved, but it was not clear. A person will check it.",
  },
  no_messages: { sw: "Hakuna ujumbe.", en: "No messages." },
  message_unclear: {
    sw: "Una ujumbe kutoka kwa daktari ambao haukueleweka. Uliza mtu.",
    en: "You have a message from your doctor that was unclear. Ask a person.",
  },
  no_entries: { sw: "Hakuna kumbukumbu bado.", en: "No entries yet." },
  unconfirmed: {
    sw: "Kumbukumbu {n} hazijathibitishwa. Haieleweki, uliza mtu.",
    en: "{n} entries are unconfirmed. Unclear, ask a person.",
  },
  busy: { sw: "Huduma ina shughuli nyingi, jaribu tena.", en: "Service busy, try again." },
  prescription: { sw: "Dawa:", en: "Prescription:" },
  diagnosis: { sw: "Utambuzi:", en: "Diagnosis:" },
} as const;

export type PromptKey = keyof typeof PROMPTS;

/** The very first prompt is bilingual: no language chosen yet. */
export const LANG_PROMPT = "Kwa Kiswahili, bonyeza 1. For English, press 2.";

export function t(lang: Lang, key: PromptKey, vars: Record<string, string | number> = {}): string {
  return PROMPTS[key][lang].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export const initialState: CallState = {
  step: "idle",
  lang: "sw",
  role: null,
  number: "",
  pin: "",
  digits: "",
  recordKind: null,
};

export function startCall(): Transition {
  return { state: { ...initialState, step: "lang" }, say: [LANG_PROMPT] };
}

export function menuStep(s: CallState): "patient_menu" | "doctor_menu" {
  return s.role === "doctor" ? "doctor_menu" : "patient_menu";
}

/** Go back to the role's menu, saying `lines` first, then the menu prompt. */
export function backToMenu(s: CallState, lines: string[]): Transition {
  const step = menuStep(s);
  return { state: { ...s, step, recordKind: null }, say: [...lines, t(s.lang, step)] };
}

const MIN_DIGITS = { number: 3, pin: 4 } as const;

export function press(s: CallState, key: string): Transition {
  const stay = (lines: string[]): Transition => ({ state: s, say: lines });
  const invalid = (prompt: string) => stay([t(s.lang, "invalid"), prompt]);

  switch (s.step) {
    case "idle":
    case "working":
      return stay([]);

    case "lang":
      if (key === "1" || key === "2") {
        const lang: Lang = key === "1" ? "sw" : "en";
        return { state: { ...s, lang, step: "number" }, say: [t(lang, "number")] };
      }
      return stay([LANG_PROMPT]);

    case "number":
    case "pin": {
      const step = s.step;
      if (/^\d$/.test(key)) return { state: { ...s, digits: s.digits + key }, say: [] };
      if (key === "*") return { state: { ...s, digits: "" }, say: [t(s.lang, step)] };
      // key === "#"
      if (s.digits.length < MIN_DIGITS[step]) return { state: { ...s, digits: "" }, say: [t(s.lang, "too_short"), t(s.lang, step)] };
      if (step === "number") return { state: { ...s, number: s.digits, digits: "", step: "pin" }, say: [t(s.lang, "pin")] };
      return { state: { ...s, pin: s.digits, digits: "", step: "working" }, say: [], effect: { type: "login" } };
    }

    case "not_found":
      if (key === "1") return { state: { ...s, step: "working" }, say: [], effect: { type: "register" } };
      if (key === "2") return { state: { ...s, number: "", pin: "", step: "number" }, say: [t(s.lang, "number")] };
      return invalid(t(s.lang, "not_found"));

    case "role":
      if (key === "1" || key === "2") {
        const role: Role = key === "1" ? "patient" : "doctor";
        const step = role === "doctor" ? "doctor_menu" : "patient_menu";
        return { state: { ...s, role, step }, say: [t(s.lang, step)] };
      }
      return invalid(t(s.lang, "role"));

    case "patient_menu":
      if (key === "1") return record(s, "symptom");
      if (key === "2") return { state: { ...s, step: "working" }, say: [], effect: { type: "inbox" } };
      return invalid(t(s.lang, "patient_menu"));

    case "doctor_menu":
      if (key === "1") return { state: { ...s, step: "working" }, say: [], effect: { type: "retrieve" } };
      if (key === "2") return record(s, "doctor_diagnosis");
      if (key === "3") return record(s, "doctor_prescription");
      if (key === "4") return record(s, "symptom_log");
      return invalid(t(s.lang, "doctor_menu"));

    case "record":
      if (key === "*") return backToMenu(s, []);
      return stay([]);
  }
}

function record(s: CallState, kind: RecordKind): Transition {
  return { state: { ...s, step: "record", recordKind: kind }, say: [t(s.lang, "record")] };
}

/** Audio captured while in the record step. */
export function audioCaptured(s: CallState): Transition {
  if (s.step !== "record" || !s.recordKind) return { state: s, say: [] };
  return { state: { ...s, step: "working" }, say: [], effect: { type: "send_audio", kind: s.recordKind } };
}

export type LoginOutcome = "ok" | "not_found" | { error: string };

export function afterLogin(s: CallState, outcome: LoginOutcome): Transition {
  if (outcome === "ok") return { state: { ...s, step: "role" }, say: [t(s.lang, "role")] };
  if (outcome === "not_found") return { state: { ...s, step: "not_found" }, say: [t(s.lang, "not_found")] };
  return { state: { ...s, number: "", pin: "", step: "number" }, say: [outcome.error, t(s.lang, "number")] };
}

export function afterRegister(s: CallState, outcome: "ok" | { error: string }): Transition {
  if (outcome === "ok") return { state: { ...s, step: "role" }, say: [t(s.lang, "registered"), t(s.lang, "role")] };
  return { state: { ...s, number: "", pin: "", step: "number" }, say: [outcome.error, t(s.lang, "number")] };
}
