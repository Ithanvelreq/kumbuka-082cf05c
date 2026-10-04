// POST { patient_id, pin, call_lang: "sw" | "en" }
import { makeDeps } from "../_shared/infra/container.ts";
import { handler, requireCallLang, requireString } from "../_shared/infra/http.ts";
import { retrieve } from "../_shared/use-cases/retrieve.ts";

Deno.serve(handler((body) =>
  retrieve(
    {
      patientId: requireString(body, "patient_id"),
      pin: requireString(body, "pin"),
      targetLang: requireCallLang(body),
    },
    makeDeps(),
  )
));
