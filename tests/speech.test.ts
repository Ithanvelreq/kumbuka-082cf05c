import { test } from "vitest";
import assert from "node:assert/strict";
import { pickVoice } from "../src/lib/speech.ts";

const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
const VOICES = [voice("Samantha", "en-US"), voice("Paulina", "es-MX"), voice("Mónica", "es-ES"), voice("Lesya", "uk_UA")];

test("exact language and region wins", () => {
  assert.equal(pickVoice(VOICES, "es-ES")?.name, "Mónica");
});

test("falls back to the same language in another region", () => {
  assert.equal(pickVoice([voice("Paulina", "es-MX")], "es-ES")?.name, "Paulina");
});

test("underscore tags (uk_UA) match", () => {
  assert.equal(pickVoice(VOICES, "uk-UA")?.name, "Lesya");
});

test("no voice for the language gives null, not an English voice", () => {
  assert.equal(pickVoice(VOICES, "sw-KE"), null);
});
