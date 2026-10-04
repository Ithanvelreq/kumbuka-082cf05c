// POST { patient_id, pin, call_lang: "sw" | "en", audio: { base64, mime_type } }
// Doctor's spoken question about the record -> answer from logged entries only. Nothing is stored.
import { makeDeps } from "../_shared/infra/container.ts";
import { handler, parseAudio, requireCallLang, requireString } from "../_shared/infra/http.ts";
import { ask } from "../_shared/use-cases/ask.ts";

Deno.serve(handler((body) =>
  ask(
    {
      patientId: requireString(body, "patient_id"),
      pin: requireString(body, "pin"),
      callLang: requireCallLang(body),
      audio: parseAudio(body),
    },
    makeDeps(),
  )
));
