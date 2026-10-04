// Keypad call menu as a pure state machine (no React, no network) so it can be tested with node.
// The component executes the returned `effect` and feeds the outcome back via the `after*` functions.
// The language choice only selects which translation models the backend uses; storage is always English.

export type Lang = "sw" | "en" | "es" | "uk";
export type Role = "patient" | "doctor";
export type RecordKind = "symptom" | "doctor_diagnosis" | "doctor_prescription" | "symptom_log" | "question";

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

// TODO before a real pilot: have native speakers review the Swahili, Spanish and Ukrainian prompts.
const PROMPTS = {
  number: {
    sw: "Weka namba ya mgonjwa, kisha bonyeza #.",
    en: "Enter the patient number, then press #.",
    es: "Marque el número del paciente y luego pulse #.",
    uk: "Введіть номер пацієнта, потім натисніть #.",
  },
  pin: {
    sw: "Weka PIN, kisha bonyeza #.",
    en: "Enter the PIN, then press #.",
    es: "Marque el PIN y luego pulse #.",
    uk: "Введіть PIN-код, потім натисніть #.",
  },
  not_found: {
    sw: "Namba hii haijasajiliwa. Bonyeza 1 kujisajili kwa PIN hii. Bonyeza 2 kujaribu tena.",
    en: "This number is not registered. Press 1 to register with this PIN. Press 2 to try again.",
    es: "Este número no está registrado. Pulse 1 para registrarse con este PIN. Pulse 2 para intentarlo de nuevo.",
    uk: "Цей номер не зареєстровано. Натисніть 1, щоб зареєструватися з цим PIN-кодом. Натисніть 2, щоб спробувати ще раз.",
  },
  role: {
    sw: "Kama wewe ni mgonjwa, bonyeza 1. Kama wewe ni daktari, bonyeza 2.",
    en: "If you are the patient, press 1. If you are the doctor, press 2.",
    es: "Si es el paciente, pulse 1. Si es el médico, pulse 2.",
    uk: "Якщо ви пацієнт, натисніть 1. Якщо ви лікар, натисніть 2.",
  },
  patient_menu: {
    sw: "Bonyeza 1 kurekodi dalili. Bonyeza 2 kusikiliza ujumbe wa daktari.",
    en: "Press 1 to record a symptom. Press 2 to hear messages from your doctor.",
    es: "Pulse 1 para grabar un síntoma. Pulse 2 para escuchar los mensajes de su médico.",
    uk: "Натисніть 1, щоб записати симптом. Натисніть 2, щоб прослухати повідомлення від лікаря.",
  },
  doctor_menu: {
    sw: "Bonyeza 1 kusikiliza historia ya mgonjwa. Bonyeza 2 kurekodi utambuzi. Bonyeza 3 kurekodi dawa. Bonyeza 4 kurekodi maelezo ya mazungumzo. Bonyeza 5 kuuliza swali kuhusu historia.",
    en: "Press 1 to hear the patient's history. Press 2 to record a diagnosis. Press 3 to record a prescription. Press 4 to record a consultation note. Press 5 to ask a question about the history.",
    es: "Pulse 1 para escuchar el historial del paciente. Pulse 2 para grabar un diagnóstico. Pulse 3 para grabar una receta. Pulse 4 para grabar una nota de la consulta. Pulse 5 para hacer una pregunta sobre el historial.",
    uk: "Натисніть 1, щоб прослухати історію пацієнта. Натисніть 2, щоб записати діагноз. Натисніть 3, щоб записати призначення. Натисніть 4, щоб записати нотатку про прийом. Натисніть 5, щоб поставити запитання про історію.",
  },
  record: {
    sw: "Ongea baada ya mlio. Bonyeza * kurudi.",
    en: "Speak after the beep. Press * to go back.",
    es: "Hable después del tono. Pulse * para volver.",
    uk: "Говоріть після сигналу. Натисніть *, щоб повернутися.",
  },
  ask_record: {
    sw: "Uliza swali lako baada ya mlio. Bonyeza * kurudi.",
    en: "Ask your question after the beep. Press * to go back.",
    es: "Haga su pregunta después del tono. Pulse * para volver.",
    uk: "Поставте запитання після сигналу. Натисніть *, щоб повернутися.",
  },
  ask_not_recorded: {
    sw: "Hili halipo kwenye kumbukumbu.",
    en: "This is not in the record.",
    es: "Esto no consta en el historial.",
    uk: "Цього немає в записах.",
  },
  ask_out_of_scope: {
    sw: "Ninaweza kueleza tu kilichorekodiwa. Siwezi kutambua ugonjwa wala kushauri.",
    en: "I can only report what was recorded. I can't diagnose or advise.",
    es: "Solo puedo informar de lo que se registró. No puedo diagnosticar ni aconsejar.",
    uk: "Я можу лише повідомити те, що записано. Я не можу ставити діагноз чи радити.",
  },
  ask_unclear_question: {
    sw: "Samahani, swali halikueleweka. Tafadhali uliza tena.",
    en: "Sorry, the question was not clear. Please ask again.",
    es: "Lo siento, no se entendió la pregunta. Por favor, pregunte de nuevo.",
    uk: "Вибачте, запитання було нерозбірливим. Будь ласка, запитайте ще раз.",
  },
  ask_no_reliable_answer: {
    sw: "Sikupata jibu la uhakika. Mtu aangalie kumbukumbu.",
    en: "I could not find a reliable answer. Ask a person to check the record.",
    es: "No encontré una respuesta fiable. Pida a una persona que revise el historial.",
    uk: "Не вдалося знайти надійну відповідь. Попросіть людину перевірити записи.",
  },
  answer_in_english: {
    sw: "Jibu halikuweza kutafsiriwa kwa uhakika. Hili hapa kwa Kiingereza:",
    en: "Answer:",
    es: "No se pudo traducir la respuesta con seguridad. Aquí está en inglés:",
    uk: "Не вдалося надійно перекласти відповідь. Ось вона англійською:",
  },
  answer_unconfirmed: {
    sw: "Jibu hili linategemea kumbukumbu ambayo haijathibitishwa. Haieleweki, uliza mtu.",
    en: "This answer relies on an unconfirmed entry. Unclear, ask a person.",
    es: "Esta respuesta se basa en un registro no confirmado. No está claro, pregunte a una persona.",
    uk: "Ця відповідь спирається на непідтверджений запис. Незрозуміло, запитайте в людини.",
  },
  invalid: { sw: "Chaguo si sahihi.", en: "Invalid choice.", es: "Opción no válida.", uk: "Неправильний вибір." },
  too_short: { sw: "Namba fupi mno.", en: "Too short.", es: "Demasiado corto.", uk: "Занадто коротко." },
  registered: { sw: "Umesajiliwa.", en: "You are registered.", es: "Se ha registrado.", uk: "Вас зареєстровано." },
  saved: { sw: "Imehifadhiwa.", en: "Saved.", es: "Guardado.", uk: "Збережено." },
  saved_unclear: {
    sw: "Imehifadhiwa, lakini haikueleweka vizuri. Mtu ataikagua.",
    en: "Saved, but it was not clear. A person will check it.",
    es: "Guardado, pero no se entendió bien. Una persona lo revisará.",
    uk: "Збережено, але запис нерозбірливий. Його перевірить людина.",
  },
  no_messages: { sw: "Hakuna ujumbe.", en: "No messages.", es: "No hay mensajes.", uk: "Повідомлень немає." },
  message_unclear: {
    sw: "Una ujumbe kutoka kwa daktari ambao haukueleweka. Uliza mtu.",
    en: "You have a message from your doctor that was unclear. Ask a person.",
    es: "Tiene un mensaje de su médico que no se entendió. Pregunte a una persona.",
    uk: "У вас є повідомлення від лікаря, яке не вдалося розібрати. Запитайте в людини.",
  },
  no_entries: { sw: "Hakuna kumbukumbu bado.", en: "No entries yet.", es: "Todavía no hay registros.", uk: "Записів поки немає." },
  unconfirmed: {
    sw: "Kumbukumbu {n} hazijathibitishwa. Haieleweki, uliza mtu.",
    en: "{n} entries are unconfirmed. Unclear, ask a person.",
    es: "{n} registros no están confirmados. No está claro, pregunte a una persona.",
    uk: "Непідтверджених записів: {n}. Незрозуміло, запитайте в людини.",
  },
  summary_in_english: {
    sw: "Muhtasari haukuweza kutafsiriwa kwa uhakika. Huu hapa kwa Kiingereza:",
    en: "Summary:",
    es: "No se pudo traducir el resumen con seguridad. Aquí está en inglés:",
    uk: "Не вдалося надійно перекласти підсумок. Ось він англійською:",
  },
  busy: {
    sw: "Huduma ina shughuli nyingi, jaribu tena.",
    en: "Service busy, try again.",
    es: "El servicio está ocupado, inténtelo de nuevo.",
    uk: "Сервіс зайнятий, спробуйте ще раз.",
  },
  prescription: { sw: "Dawa:", en: "Prescription:", es: "Receta:", uk: "Призначення:" },
  diagnosis: { sw: "Utambuzi:", en: "Diagnosis:", es: "Diagnóstico:", uk: "Діагноз:" },
} as const;

export type PromptKey = keyof typeof PROMPTS;

/** The very first prompt: no language chosen yet, so each option is said in its own language. */
export const LANG_CHOICES: readonly { key: string; lang: Lang; text: string }[] = [
  { key: "1", lang: "sw", text: "Kwa Kiswahili, bonyeza 1." },
  { key: "2", lang: "en", text: "For English, press 2." },
  { key: "3", lang: "es", text: "Para español, pulse 3." },
  { key: "4", lang: "uk", text: "Українською — натисніть 4." },
];
export const LANG_PROMPT: string[] = LANG_CHOICES.map((c) => c.text);

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
  return { state: { ...initialState, step: "lang" }, say: [...LANG_PROMPT] };
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

    case "lang": {
      const choice = LANG_CHOICES.find((c) => c.key === key);
      if (choice) return { state: { ...s, lang: choice.lang, step: "number" }, say: [t(choice.lang, "number")] };
      return stay([...LANG_PROMPT]);
    }

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
      if (key === "5") return record(s, "question");
      return invalid(t(s.lang, "doctor_menu"));

    case "record":
      if (key === "*") return backToMenu(s, []);
      return stay([]);
  }
}

function record(s: CallState, kind: RecordKind): Transition {
  return { state: { ...s, step: "record", recordKind: kind }, say: [t(s.lang, kind === "question" ? "ask_record" : "record")] };
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
