// POST {} -> demo-only overview of all patients. Off unless the secret DEMO_SHOW_PATIENTS=true.
import { makeDeps } from "../_shared/infra/container.ts";
import { handler } from "../_shared/infra/http.ts";
import { listPatients } from "../_shared/use-cases/list-patients.ts";

Deno.serve(handler(async () => ({
  patients: await listPatients({ enabled: Deno.env.get("DEMO_SHOW_PATIENTS")?.trim() === "true" }, makeDeps()),
})));
