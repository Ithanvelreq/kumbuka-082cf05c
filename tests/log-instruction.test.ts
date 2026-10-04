import { test } from "vitest";
import assert from "node:assert/strict";
import { numbersPreserved } from "../supabase/functions/_shared/domain/needs-review.ts";
import { ServiceBusyError } from "../supabase/functions/_shared/domain/errors.ts";
import { inbox } from "../supabase/functions/_shared/use-cases/inbox.ts";
import { logInstruction } from "../supabase/functions/_shared/use-cases/log-instruction.ts";
import { FakeSummarizer, FakeTranscriber, MemoryPatients, MemoryStorage } from "./fakes.ts";

const RX = "Paracetamol 500 mg twice a day for 3 days.";
const RX_SW = "Paracetamol 500 mg mara mbili kwa siku kwa siku 3.";
const clean = { text_en: RX, segments: [{ avg_logprob: -0.1, no_speech_prob: 0.01 }] };

function setup(transcript = clean) {
  const patients = new MemoryPatients();
  patients.rows.set("1001", { id: "1001", display_name: null, pin_check: null });
  return {
    storage: new MemoryStorage(), patients,
    transcriber: new FakeTranscriber(transcript),
    summarizer: new FakeSummarizer({ translation: { text: RX_SW, confidence: "high" } }),
  };
}
const audio = () => ({ bytes: new Uint8Array([9, 9]), mimeType: "audio/webm" });
const base = { patientId: "1001", pin: "1234", type: "doctor_prescription" as const, callLang: "sw" as const };

test("spoken prescription is stored as the English transcript, unchanged, audio wiped", async () => {
  const deps = setup();
  const a = audio();
  const e = await logInstruction({ ...base, audio: a }, deps);
  assert.deepEqual([...a.bytes], [0, 0]);
  assert.equal(e.type, "doctor_prescription");
  assert.equal(e.content.note_en, RX);
  assert.equal(e.content.needs_review, false);
  assert.equal(e.source_lang, "sw");
  assert.equal(deps.summarizer.calls.length, 0, "no LLM in this flow");
});

test("noisy doctor audio is flagged", async () => {
  const deps = setup({ text_en: "uh", segments: [{ avg_logprob: -1.5, no_speech_prob: 0.7 }] });
  const e = await logInstruction({ ...base, audio: audio() }, deps);
  assert.equal(e.content.needs_review, true);
  assert.equal(e.content.confidence, "low");
});

test("consult note is a doctor-reported symptom_log", async () => {
  const deps = setup({ text_en: "Patient reports headache for 3 days.", segments: clean.segments });
  const e = await logInstruction({ ...base, type: "symptom_log", audio: audio() }, deps);
  assert.equal(e.type === "symptom_log" && e.content.reported_by, "doctor");
});

test("unknown patient is rejected", async () => {
  await assert.rejects(logInstruction({ ...base, patientId: "9999", audio: audio() }, setup()), /Unknown patient/);
});

async function withMessages() {
  const deps = setup();
  await logInstruction({ ...base, audio: audio() }, deps);
  await deps.storage.store("1001", { type: "symptom_log", content: { reported_by: "patient", note_en: "x", confidence: "high", needs_review: false, review_reason: null, details: {} }, source_lang: "sw" });
  return deps;
}

test("inbox translates stored English into the call language at playback", async () => {
  const deps = await withMessages();
  const msgs = await inbox({ patientId: "1001", pin: "1234", callLang: "sw" }, deps);
  assert.deepEqual(msgs.map((m) => [m.type, m.text, m.needs_review]), [["doctor_prescription", RX_SW, false]]);
  assert.deepEqual(deps.summarizer.calls[0].args, [RX, "sw"]);
});

test("inbox in English plays the stored text without any LLM", async () => {
  const deps = await withMessages();
  const msgs = await inbox({ patientId: "1001", pin: "1234", callLang: "en" }, deps);
  assert.equal(msgs[0].text, RX);
  assert.equal(deps.summarizer.calls.length, 0);
});

test("inbox withholds translations with changed numbers, low confidence, or failures", async () => {
  for (const translation of [
    { text: "Paracetamol 50 mg mara mbili kwa siku 3.", confidence: "high" as const },
    { text: RX_SW, confidence: "low" as const },
    new SyntaxError("bad json"),
  ]) {
    const deps = await withMessages();
    deps.summarizer.responses.translation = translation;
    const [m] = await inbox({ patientId: "1001", pin: "1234", callLang: "sw" }, deps);
    assert.deepEqual([m.text, m.needs_review], [null, true]);
  }
});

test("inbox never plays flagged messages", async () => {
  const deps = setup({ text_en: "uh", segments: [{ avg_logprob: -1.5, no_speech_prob: 0.7 }] });
  await logInstruction({ ...base, audio: audio() }, deps);
  const [m] = await inbox({ patientId: "1001", pin: "1234", callLang: "sw" }, deps);
  assert.deepEqual([m.text, m.needs_review], [null, true]);
  assert.equal(deps.summarizer.calls.length, 0);
});

test("inbox propagates busy", async () => {
  const deps = await withMessages();
  deps.summarizer.responses.translation = new ServiceBusyError();
  await assert.rejects(inbox({ patientId: "1001", pin: "1234", callLang: "sw" }, deps), ServiceBusyError);
});

test("numbersPreserved", () => {
  assert.equal(numbersPreserved("500 mg x 2", "2 fois 500 mg"), true);
  assert.equal(numbersPreserved("1.5 ml", "1,5 ml"), true);
  assert.equal(numbersPreserved("500 mg", "50 mg"), false);
});
