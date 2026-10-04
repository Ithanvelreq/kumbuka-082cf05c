// Browser text-to-speech voice choice. Setting only `utterance.lang` is not enough: browsers often keep
// the default (English) voice, so the voice is picked explicitly from the ones installed on the computer.

/** Best installed voice for a tag like "uk-UA": exact match first, then the same language (es-MX for es-ES). */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], tag: string): SpeechSynthesisVoice | null {
  const norm = (lang: string) => lang.replace("_", "-").toLowerCase();
  const want = norm(tag);
  const base = want.split("-")[0];
  return voices.find((v) => norm(v.lang) === want) ?? voices.find((v) => norm(v.lang).split("-")[0] === base) ?? null;
}
