// Edge translation of English output (summaries, answers) into the call language, with the playback checks.
import { numbersPreserved } from "../domain/needs-review.ts";
import type { Summarizer } from "../domain/ports.ts";
import type { CallLang } from "../domain/types.ts";

/**
 * Translation the listener can rely on, or null: not low confidence, not empty, numbers unchanged.
 * Any failure (including busy) returns null so the caller can fall back to the English text it already has.
 */
export async function translateOrNull(
  summarizer: Pick<Summarizer, "fromEnglish">,
  textEn: string,
  lang: CallLang,
): Promise<string | null> {
  if (lang === "en") return textEn;
  try {
    const tr = await summarizer.fromEnglish(textEn, lang);
    const text = tr.text.trim();
    return tr.confidence !== "low" && text !== "" && numbersPreserved(textEn, text) ? text : null;
  } catch {
    return null;
  }
}
