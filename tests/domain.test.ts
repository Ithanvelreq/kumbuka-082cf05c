import { test } from "vitest";
import assert from "node:assert/strict";
import { decideNeedsReview } from "../supabase/functions/_shared/domain/needs-review.ts";
import { coerceCore, validateContent } from "../supabase/functions/_shared/domain/schema.ts";

const good = { avg_logprob: -0.2, no_speech_prob: 0.05 };
const base = { sourceText: "I have had a headache for three days", llmConfidence: "high" as const, noteEn: "Headache for three days.", parsedOk: true };

test("clean input does not need review", () => {
  assert.deepEqual(decideNeedsReview({ ...base, segments: [good] }), { needs_review: false, review_reason: null });
});

test("low avg_logprob flags review", () => {
  const r = decideNeedsReview({ ...base, segments: [good, { avg_logprob: -1.3, no_speech_prob: 0.1 }] });
  assert.equal(r.needs_review, true);
  assert.match(r.review_reason!, /Low transcription confidence/);
});

test("high no_speech_prob flags review", () => {
  assert.equal(decideNeedsReview({ ...base, segments: [{ avg_logprob: -0.1, no_speech_prob: 0.9 }] }).needs_review, true);
});

test("no segments means no speech", () => {
  assert.match(decideNeedsReview({ ...base, segments: [] }).review_reason!, /No speech/);
});

test("LLM low confidence flags review", () => {
  assert.equal(decideNeedsReview({ ...base, llmConfidence: "low" }).needs_review, true);
});

test("empty note and short transcript flag review", () => {
  const r = decideNeedsReview({ ...base, noteEn: "", sourceText: "uh" });
  assert.match(r.review_reason!, /Empty note/);
  assert.match(r.review_reason!, /too short/);
});

test("parse failure flags review", () => {
  assert.equal(decideNeedsReview({ ...base, parsedOk: false }).needs_review, true);
});

test("typed text (no segments) skips segment rules", () => {
  assert.equal(decideNeedsReview(base).needs_review, false);
});

test("validateContent accepts a well-formed symptom_log", () => {
  const c = { reported_by: "patient", note_en: "x", confidence: "high", needs_review: false, review_reason: null, details: {} };
  assert.equal(validateContent("symptom_log", c).ok, true);
});

test("validateContent rejects bad shapes", () => {
  assert.equal(validateContent("symptom_log", { note_en: "x", confidence: "high", needs_review: false, review_reason: null, details: {} }).ok, false);
  assert.equal(validateContent("doctor_diagnosis", { note_en: 1 }).ok, false);
  assert.equal(validateContent("lab_result", { note_en: "x", confidence: "sure", needs_review: false, review_reason: null, details: {} }).ok, false);
  assert.equal(validateContent("doctor_prescription", "nope").ok, false);
});

test("coerceCore defaults unknown confidence to low and never invents fields", () => {
  assert.deepEqual(coerceCore({ note_en: " hi ", confidence: "certain" }), {
    note_en: "hi", confidence: "low", needs_review: false, review_reason: null, details: {},
  });
  assert.equal(coerceCore("junk"), null);
});
