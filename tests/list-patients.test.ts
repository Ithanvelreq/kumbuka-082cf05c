import { test } from "vitest";
import assert from "node:assert/strict";
import { ForbiddenError } from "../supabase/functions/_shared/domain/errors.ts";
import { listPatients } from "../supabase/functions/_shared/use-cases/list-patients.ts";
import { MemoryPatients } from "./fakes.ts";

function setup() {
  const patients = new MemoryPatients();
  patients.rows.set("1001", { id: "1001", display_name: "Noor (synthetic)", pin_check: null, created_at: "2026-09-01T00:00:00Z" });
  patients.rows.set("9001", { id: "9001", display_name: null, pin_check: null, created_at: "2026-10-04T00:00:00Z" });
  patients.rows.set("5555", { id: "5555", display_name: null, pin_check: null, created_at: "2026-10-04T01:00:00Z" });
  patients.entryMeta.set("1001", [
    { type: "symptom_log", source_lang: "sw", created_at: "2026-09-28T10:00:00Z", reported_by: "patient" },
    { type: "doctor_prescription", source_lang: "es", created_at: "2026-10-02T10:00:00Z", reported_by: null },
    { type: "symptom_log", source_lang: "en", created_at: "2026-10-03T10:00:00Z", reported_by: "patient" },
    { type: "symptom_log", source_lang: "sw", created_at: "2026-10-01T10:00:00Z", reported_by: "patient" },
  ]);
  patients.entryMeta.set("9001", [
    { type: "symptom_log", source_lang: "uk", created_at: "2026-10-04T10:00:00Z", reported_by: "doctor" },
  ]);
  return { patients };
}

test("switched off by default: forbidden", async () => {
  await assert.rejects(listPatients({ enabled: false }, setup()), ForbiddenError);
});

test("history length, first/last entry, and the patient's own languages (most recent first)", async () => {
  const list = await listPatients({ enabled: true }, setup());
  assert.deepEqual(list[0], {
    id: "1001", display_name: "Noor (synthetic)", registered_at: "2026-09-01T00:00:00Z",
    entries: 4, first_entry_at: "2026-09-28T10:00:00Z", last_entry_at: "2026-10-03T10:00:00Z",
    languages: ["en", "sw"], // the doctor's Spanish call doesn't count
  });
});

test("doctor-only histories have no patient language; empty histories are zero", async () => {
  const [, doctorOnly, empty] = await listPatients({ enabled: true }, setup());
  assert.deepEqual([doctorOnly!.entries, doctorOnly!.languages], [1, []]);
  assert.deepEqual([empty!.entries, empty!.first_entry_at, empty!.languages], [0, null, []]);
});
