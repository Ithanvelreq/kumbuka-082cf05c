import { test } from "vitest";
import assert from "node:assert/strict";
import { ServiceBusyError } from "../supabase/functions/_shared/domain/errors.ts";
import { citedDates, isGrounded } from "../supabase/functions/_shared/domain/grounding.ts";
import type { HistoryAnswer, Translation } from "../supabase/functions/_shared/domain/ports.ts";
import type { SymptomLogContent } from "../supabase/functions/_shared/domain/types.ts";
import { ask } from "../supabase/functions/_shared/use-cases/ask.ts";
import { FakeSummarizer, FakeTranscriber, MemoryPatients, MemoryStorage } from "./fakes.ts";

const Q = "When did the fever start?";
const clear = { text_en: Q, segments: [{ avg_logprob: -0.1, no_speech_prob: 0.01 }] };
const log = (note_en: string, needs_review = false): SymptomLogContent => ({
  reported_by: "patient", note_en, confidence: "high", needs_review, review_reason: needs_review ? "x" : null, details: {},
});

// MemoryStorage dates entries 2026-10-01, 2026-10-02, ... in insertion order (local time).
async function setup(answer?: HistoryAnswer | Error, translation?: Translation | Error, transcript = clear, entries = true) {
  const patients = new MemoryPatients();
  patients.rows.set("1001", { id: "1001", display_name: null, pin_check: null });
  const storage = new MemoryStorage();
  if (entries) {
    await storage.store("1001", { type: "symptom_log", content: log("Headache for three days."), source_lang: "sw" });
    await storage.store("1001", { type: "symptom_log", content: log("Fever at night since yesterday."), source_lang: "sw" });
    await storage.store("1001", { type: "symptom_log", content: log("Something about the stomach.", true), source_lang: "sw" });
  }
  const days = storage.events.map((e) => e.created_at.slice(0, 10));
  const summarizer = new FakeSummarizer({ answer, translation });
  const deps = { storage, patients, transcriber: new FakeTranscriber(transcript), summarizer };
  return { deps, days, summarizer };
}
const audio = () => ({ bytes: new Uint8Array([7, 7]), mimeType: "audio/webm" });
const input = (callLang: "sw" | "en" = "en") => ({ patientId: "1001", pin: "1234", callLang, audio: audio() });

test("answers from the record, citing an entry date; audio wiped; question passed in English", async () => {
  const { deps, days, summarizer } = await setup();
  const answer = `On ${days[1]} the patient reported fever at night since yesterday.`;
  summarizer.responses.answer = { status: "answered", answer, confidence: "high" };
  const i = input();
  const r = await ask(i, deps);
  assert.deepEqual([...i.audio.bytes], [0, 0]);
  assert.deepEqual(r, { status: "answered", question_en: Q, answer, answer_lang: "en", uses_unconfirmed: false });
  assert.equal(summarizer.calls[0].args[1], Q);
});

test("Swahili calls get the answer translated, with the usual checks", async () => {
  const { deps, days, summarizer } = await setup();
  summarizer.responses.answer = { status: "answered", answer: `On ${days[1]} the patient reported fever.`, confidence: "high" };
  summarizer.responses.translation = { text: `Tarehe ${days[1]} mgonjwa aliripoti homa.`, confidence: "high" };
  const r = await ask(input("sw"), deps);
  assert.deepEqual([r.answer, r.answer_lang], [`Tarehe ${days[1]} mgonjwa aliripoti homa.`, "sw"]);

  summarizer.responses.translation = { text: "Mgonjwa aliripoti homa.", confidence: "high" }; // date dropped
  const r2 = await ask(input("sw"), deps);
  assert.equal(r2.answer_lang, "en", "untrustworthy translation falls back to English");
});

test("answers citing an unconfirmed entry's day are flagged", async () => {
  const { deps, days, summarizer } = await setup();
  summarizer.responses.answer = { status: "answered", answer: `On ${days[2]} the patient mentioned the stomach (unconfirmed).`, confidence: "medium" };
  assert.equal((await ask(input(), deps)).uses_unconfirmed, true);
});

test("ungrounded or unsure answers are withheld", async () => {
  for (const answer of [
    { status: "answered" as const, answer: "The fever started on 2026-01-15.", confidence: "high" as const }, // date not in record
    { status: "answered" as const, answer: "The fever started recently.", confidence: "high" as const }, // no date cited
    { status: "answered" as const, answer: "", confidence: "high" as const },
  ]) {
    const { deps } = await setup(answer);
    assert.deepEqual([(await ask(input(), deps)).status], ["no_reliable_answer"]);
  }
  const { deps, days } = await setup();
  deps.summarizer.responses.answer = { status: "answered", answer: `On ${days[1]} fever.`, confidence: "low" };
  assert.equal((await ask(input(), deps)).status, "no_reliable_answer");
});

test("not recorded and out of scope pass through without an answer", async () => {
  for (const status of ["not_recorded", "out_of_scope"] as const) {
    const { deps } = await setup({ status, answer: "She probably has malaria.", confidence: "high" });
    const r = await ask(input(), deps);
    assert.deepEqual([r.status, r.answer], [status, null]);
  }
});

test("an unclear question is not sent to the model", async () => {
  const { deps, summarizer } = await setup(undefined, undefined, { text_en: "uh", segments: [{ avg_logprob: -1.5, no_speech_prob: 0.8 }] });
  assert.equal((await ask(input(), deps)).status, "unclear_question");
  assert.equal(summarizer.calls.length, 0);
});

test("empty record says so without calling the model", async () => {
  const { deps, summarizer } = await setup(undefined, undefined, clear, false);
  assert.equal((await ask(input(), deps)).status, "empty");
  assert.equal(summarizer.calls.length, 0);
});

test("model errors give no answer; busy propagates", async () => {
  const { deps } = await setup(new SyntaxError("bad json"));
  assert.equal((await ask(input(), deps)).status, "no_reliable_answer");
  const b = await setup(new ServiceBusyError());
  await assert.rejects(ask(input(), b.deps), ServiceBusyError);
});

test("unknown patient is rejected before transcription", async () => {
  const { deps } = await setup();
  await assert.rejects(ask({ ...input(), patientId: "9999" }, deps), /Unknown patient/);
  assert.equal(deps.transcriber.seenBytes, null);
});

test("grounding helpers", () => {
  assert.deepEqual(citedDates("On 2026-10-01 and 2026-10-01, then 2026-10-03."), ["2026-10-01", "2026-10-03"]);
  const days = new Set(["2026-10-01", "2026-10-03"]);
  assert.equal(isGrounded("On 2026-10-01 fever.", days), true);
  assert.equal(isGrounded("On 2026-10-02 fever.", days), false);
  assert.equal(isGrounded("Fever.", days), false);
});
