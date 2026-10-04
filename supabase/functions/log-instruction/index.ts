// POST { patient_id, pin, type, call_lang: "sw" | "en" | "es" | "uk", audio: { base64, mime_type } }
// type: doctor_diagnosis | doctor_prescription | symptom_log (consult note, reported_by: doctor)
import { ValidationError } from "../_shared/domain/errors.ts";
import { makeDeps } from "../_shared/infra/container.ts";
import { handler, parseAudio, requireCallLang, requireString } from "../_shared/infra/http.ts";
import { INSTRUCTION_TYPES, type InstructionType, logInstruction } from "../_shared/use-cases/log-instruction.ts";

Deno.serve(handler(async (body) => {
  const type = requireString(body, "type");
  if (!(INSTRUCTION_TYPES as readonly string[]).includes(type)) throw new ValidationError(`type must be one of ${INSTRUCTION_TYPES.join(", ")}`);
  const event = await logInstruction(
    {
      patientId: requireString(body, "patient_id"),
      pin: requireString(body, "pin"),
      type: type as InstructionType,
      callLang: requireCallLang(body),
      audio: parseAudio(body),
    },
    makeDeps(),
  );
  return { event };
}));
