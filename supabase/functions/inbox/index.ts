// POST { patient_id, pin, call_lang: "sw" | "en" | "es" | "uk" } -> doctor messages translated into the call language.
import { makeDeps } from "../_shared/infra/container.ts";
import { handler, requireCallLang, requireString } from "../_shared/infra/http.ts";
import { inbox } from "../_shared/use-cases/inbox.ts";

Deno.serve(handler(async (body) => ({
  messages: await inbox(
    { patientId: requireString(body, "patient_id"), pin: requireString(body, "pin"), callLang: requireCallLang(body) },
    makeDeps(),
  ),
})));
