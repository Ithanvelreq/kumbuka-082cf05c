import { test } from "vitest";
import assert from "node:assert/strict";
import { afterLogin, afterRegister, audioCaptured, type CallState, LANG_PROMPT, press, startCall, type Transition } from "../src/lib/call-flow.ts";

/** Press a sequence of keys, returning the final transition. */
function keys(s: CallState, seq: string): Transition {
  let tr: Transition = { state: s, say: [] };
  for (const k of seq) tr = press(tr.state, k);
  return tr;
}

test("call opens with the bilingual language prompt", () => {
  const tr = startCall();
  assert.equal(tr.state.step, "lang");
  assert.deepEqual(tr.say, [LANG_PROMPT]);
});

test("language -> number -> PIN -> login effect", () => {
  let tr = press(startCall().state, "2");
  assert.equal(tr.state.lang, "en");
  assert.match(tr.say[0], /patient number/);
  tr = keys(tr.state, "1001#");
  assert.equal(tr.state.number, "1001");
  assert.equal(tr.state.step, "pin");
  tr = keys(tr.state, "1234#");
  assert.equal(tr.state.pin, "1234");
  assert.deepEqual(tr.effect, { type: "login" });
  assert.equal(tr.state.step, "working");
});

test("Swahili choice gives Swahili prompts", () => {
  const tr = press(startCall().state, "1");
  assert.equal(tr.state.lang, "sw");
  assert.match(tr.say[0], /namba ya mgonjwa/);
});

test("short entries are rejected and * clears", () => {
  const s = press(startCall().state, "2").state;
  assert.match(keys(s, "12#").say[0], /Too short/);
  assert.equal(keys(s, "12*").state.digits, "");
});

test("unknown number offers registration", () => {
  const s = keys(press(startCall().state, "2").state, "5555#1234#").state;
  const nf = afterLogin(s, "not_found");
  assert.equal(nf.state.step, "not_found");
  assert.deepEqual(press(nf.state, "1").effect, { type: "register" });
  assert.equal(press(nf.state, "2").state.step, "number");
  assert.equal(afterRegister(nf.state, "ok").state.step, "role");
});

test("role 1 = patient menu, role 2 = doctor menu", () => {
  const s = afterLogin(keys(press(startCall().state, "2").state, "1001#1234#").state, "ok").state;
  assert.equal(s.step, "role");
  const patient = press(s, "1").state;
  assert.equal(patient.step, "patient_menu");
  assert.deepEqual(press(patient, "2").effect, { type: "inbox" });
  const doctor = press(s, "2").state;
  assert.equal(doctor.step, "doctor_menu");
  assert.deepEqual(press(doctor, "1").effect, { type: "retrieve" });
});

test("doctor records a prescription: record step, audio -> send effect, * goes back", () => {
  const s = afterLogin(keys(press(startCall().state, "2").state, "1001#1234#").state, "ok").state;
  const rec = press(press(s, "2").state, "3");
  assert.equal(rec.state.step, "record");
  assert.equal(rec.state.recordKind, "doctor_prescription");
  assert.deepEqual(audioCaptured(rec.state).effect, { type: "send_audio", kind: "doctor_prescription" });
  assert.equal(press(rec.state, "*").state.step, "doctor_menu");
});

test("invalid menu keys repeat the menu", () => {
  const s = press(afterLogin(keys(press(startCall().state, "2").state, "1001#1234#").state, "ok").state, "1").state;
  const tr = press(s, "9");
  assert.equal(tr.state.step, "patient_menu");
  assert.match(tr.say[0], /Invalid/);
});

test("keys are ignored while working", () => {
  const s = keys(press(startCall().state, "2").state, "1001#1234#").state;
  assert.equal(s.step, "working");
  assert.equal(press(s, "1").state, s);
});
