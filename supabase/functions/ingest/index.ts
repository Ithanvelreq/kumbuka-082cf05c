// POST { patient_id, pin, call_lang: "sw" | "en" | "es" | "ru", audio: { base64, mime_type } }
import { makeDeps } from "../_shared/infra/container.ts";
import { handler, parseAudio, requireCallLang, requireString } from "../_shared/infra/http.ts";
import { ingest } from "../_shared/use-cases/ingest.ts";

Deno.serve(handler(async (body) => {
  const event = await ingest(
    {
      patientId: requireString(body, "patient_id"),
      pin: requireString(body, "pin"),
      sourceLang: requireCallLang(body),
      audio: parseAudio(body),
    },
    makeDeps(),
  );
  return { event };
}));
