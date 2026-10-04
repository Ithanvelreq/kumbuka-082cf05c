// Per-language model choice. The caller's language selection only decides which models run at the edges;
// everything is stored in English. (Production: local Whisper small + small open LLM, per language.)
import type { CallLang } from "../domain/types.ts";
import { LLM_MODEL, WHISPER_MODEL } from "./groq-http.ts";

export interface LangModels {
  /** "transcribe" = speech is already English; "translate" = Whisper speech -> English. */
  whisperMode: "transcribe" | "translate";
  whisperModel: string;
  /** LLM used to write output in this language (summaries, playback of doctor messages). */
  llmModel: string;
  name: string;
}

export const LANG_MODELS: Record<CallLang, LangModels> = {
  en: { name: "English", whisperMode: "transcribe", whisperModel: WHISPER_MODEL, llmModel: LLM_MODEL },
  sw: {
    name: "Swahili",
    whisperMode: "translate",
    whisperModel: Deno.env.get("GROQ_WHISPER_MODEL_SW") ?? WHISPER_MODEL,
    llmModel: Deno.env.get("GROQ_LLM_MODEL_SW") ?? LLM_MODEL,
  },
};
