import { test } from "vitest";
import assert from "node:assert/strict";
import { ServiceBusyError } from "../supabase/functions/_shared/domain/errors.ts";
import { ingest } from "../supabase/functions/_shared/use-cases/ingest.ts";
import { FakeSummarizer, FakeTranscriber, MemoryPatients, MemoryStorage } from "./fakes.ts";

const goodTranscript = { text_en: "I have had a headache for three days.", segments: [{ avg_logprob: -0.2, no_speech_prob: 0.02 }] };

function setup(transcript: ConstructorParameters<typeof FakeTranscriber>[0], structure: unknown) {
  const patients = new MemoryPatients();
  patients.rows.set("noor", { id: "noor", display_name: "Noor", pin_check: "x" });
  const deps = { storage: new MemoryStorage(), patients, transcriber: new FakeTranscriber(transcript), summarizer: new FakeSummarizer({ structure }) };
  const input = { patientId: "noor", pin: "1234", sourceLang: "sw" as const, audio: { bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/webm" } };
  return { deps, input };
}

test("clean clip is stored as a confident symptom_log with transcript kept", async () => {
  const { deps, input } = setup(goodTranscript, { note_en: "Headache for three days.", confidence: "high", details: { duration: "3 days" } });
  const e = await ingest(input, deps);
  assert.equal(e.type, "symptom_log");
  assert.equal(e.source_lang, "sw");
  assert.equal(e.content.needs_review, false);
  assert.deepEqual(e.content.details, { duration: "3 days", transcript_en: goodTranscript.text_en });
  assert.equal(deps.storage.events.length, 1);
});

test("audio buffer is wiped after transcription", async () => {
  const { deps, input } = setup(goodTranscript, { note_en: "x y", confidence: "high" });
  await ingest(input, deps);
  assert.deepEqual([...deps.transcriber.seenBytes!], [0, 0, 0]);
});

test("audio buffer is wiped even if transcription fails", async () => {
  const { deps, input } = setup(new ServiceBusyError(), null);
  await assert.rejects(ingest(input, deps), ServiceBusyError);
  assert.deepEqual([...input.audio.bytes], [0, 0, 0]);
});

test("noisy clip is stored but flagged needs_review", async () => {
  const { deps, input } = setup({ text_en: "uh", segments: [{ avg_logprob: -1.6, no_speech_prob: 0.8 }] }, { note_en: "", confidence: "low" });
  const e = await ingest(input, deps);
  assert.equal(e.content.needs_review, true);
  assert.match(e.content.review_reason!, /Low transcription confidence/);
});

test("LLM junk is recorded as unclear, never guessed", async () => {
  const { deps, input } = setup(goodTranscript, new SyntaxError("bad json"));
  const e = await ingest(input, deps);
  assert.equal(e.content.needs_review, true);
  assert.equal(e.content.note_en, "");
  assert.match(e.content.review_reason!, /Could not structure/);
});

test("unknown patient is rejected before any inference", async () => {
  const { deps, input } = setup(goodTranscript, {});
  await assert.rejects(ingest({ ...input, patientId: "ghost" }, deps), /Unknown patient/);
  assert.equal(deps.transcriber.seenBytes, null);
});

test("service busy from the LLM propagates", async () => {
  const { deps, input } = setup(goodTranscript, new ServiceBusyError());
  await assert.rejects(ingest(input, deps), ServiceBusyError);
  assert.equal(deps.storage.events.length, 0);
});
