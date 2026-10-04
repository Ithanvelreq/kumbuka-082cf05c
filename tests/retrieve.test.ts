import { test } from "vitest";
import assert from "node:assert/strict";
import { ServiceBusyError } from "../supabase/functions/_shared/domain/errors.ts";
import type { SymptomLogContent } from "../supabase/functions/_shared/domain/types.ts";
import { clampSms, EMPTY_HISTORY, retrieve, SMS_MAX_CHARS } from "../supabase/functions/_shared/use-cases/retrieve.ts";
import { FakeSummarizer, MemoryPatients, MemoryStorage } from "./fakes.ts";

const log = (note_en: string, needs_review = false): SymptomLogContent => ({
  reported_by: "patient", note_en, confidence: needs_review ? "low" : "high", needs_review,
  review_reason: needs_review ? "Low transcription confidence" : null, details: { transcript_en: `raw: ${note_en}` },
});

async function setup(summary?: string | Error) {
  const patients = new MemoryPatients();
  patients.rows.set("noor", { id: "noor", display_name: null, pin_check: null });
  const storage = new MemoryStorage();
  const summarizer = new FakeSummarizer({ summary: summary instanceof Error ? undefined : summary });
  if (summary instanceof Error) summarizer.summarizeHistory = async () => { throw summary; };
  return { deps: { storage, patients, summarizer }, storage, summarizer };
}

const input = { patientId: "noor", pin: "1", targetLang: "sw" as const };

test("empty history says so without calling the LLM", async () => {
  const { deps, summarizer } = await setup();
  assert.deepEqual(await retrieve(input, deps), { summary: EMPTY_HISTORY, empty: true, fallback: false, entries: [] });
  assert.equal(summarizer.calls.length, 0);
});

test("summary is produced in the call language and entries carry the unclear label", async () => {
  const { deps, storage, summarizer } = await setup("Kichwa kinauma siku 3. Homa (haijathibitishwa).");
  await storage.store("noor", { type: "symptom_log", content: log("Headache"), source_lang: "sw" });
  await storage.store("noor", { type: "symptom_log", content: log("stomach?", true), source_lang: "sw" });
  const r = await retrieve(input, deps);
  assert.equal(r.fallback, false);
  assert.equal(summarizer.calls[0].args[1], "sw");
  assert.equal(r.entries[1].label, "Unclear, ask a person");
  assert.equal(r.entries[1].transcript_en, "raw: stomach?");
  assert.equal(r.entries[0].label, null);
});

test("long summaries are clamped to SMS length", async () => {
  const { deps, storage } = await setup("word ".repeat(200));
  await storage.store("noor", { type: "symptom_log", content: log("x"), source_lang: "sw" });
  const r = await retrieve(input, deps);
  assert.ok(r.summary.length <= SMS_MAX_CHARS);
  assert.ok(r.summary.endsWith("…"));
});

test("LLM failure falls back to a plain list marking unconfirmed entries", async () => {
  const { deps, storage } = await setup(new SyntaxError("bad"));
  await storage.store("noor", { type: "symptom_log", content: log("Headache"), source_lang: "sw" });
  await storage.store("noor", { type: "symptom_log", content: log("", true), source_lang: "sw" });
  const r = await retrieve(input, deps);
  assert.equal(r.fallback, true);
  assert.match(r.summary, /\(unconfirmed\) Unclear, ask a person \| .*Headache/);
});

test("service busy propagates", async () => {
  const { deps, storage } = await setup(new ServiceBusyError());
  await storage.store("noor", { type: "symptom_log", content: log("x"), source_lang: "sw" });
  await assert.rejects(retrieve(input, deps), ServiceBusyError);
});

test("clampSms leaves short text alone", () => {
  assert.equal(clampSms("short"), "short");
});
