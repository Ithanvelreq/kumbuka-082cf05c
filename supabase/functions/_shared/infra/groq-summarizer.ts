// Summarizer port via a small Groq instruct model in JSON mode. Model per output language from LANG_MODELS.
import type { RawStructured, Summarizer, Translation } from "../domain/ports.ts";
import type { CallLang, Event } from "../domain/types.ts";
import { groqChatJson } from "./groq-http.ts";
import { LANG_MODELS } from "./languages.ts";
import { formatHistory, fromEnglishSystem, STRUCTURE_SYMPTOM_SYSTEM, SUMMARIZE_HISTORY_SYSTEM } from "./prompts.ts";

export class GroqSummarizer implements Summarizer {
  structureSymptom(transcriptEn: string): Promise<RawStructured> {
    return groqChatJson(STRUCTURE_SYMPTOM_SYSTEM, `Transcript:\n"""${transcriptEn}"""`);
  }

  async summarizeHistory(events: Event[]): Promise<string> {
    const out = (await groqChatJson(SUMMARIZE_HISTORY_SYSTEM, `History (oldest first):\n${formatHistory(events)}`)) as {
      summary?: unknown;
    };
    if (typeof out?.summary !== "string") throw new Error("summary missing");
    return out.summary;
  }

  async fromEnglish(textEn: string, callLang: CallLang): Promise<Translation> {
    const { name, llmModel } = LANG_MODELS[callLang];
    const out = (await groqChatJson(fromEnglishSystem(name), `Doctor's message (English):\n"""${textEn}"""`, llmModel)) as Record<string, unknown>;
    if (typeof out?.text !== "string") throw new Error("translation missing");
    const c = out.confidence;
    return { text: out.text, confidence: c === "high" || c === "medium" || c === "low" ? c : null };
  }
}
