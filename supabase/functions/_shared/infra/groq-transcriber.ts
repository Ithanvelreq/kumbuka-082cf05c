// Transcriber port via Groq Whisper. English calls use plain transcription; other languages use the
// translations endpoint (speech -> English). Audio exists only in memory for the request; nothing is written.
import type { AudioInput, Transcriber } from "../domain/ports.ts";
import type { CallLang, Transcript } from "../domain/types.ts";
import { groqFetch } from "./groq-http.ts";
import { LANG_MODELS } from "./languages.ts";

interface VerboseJson {
  text?: string;
  segments?: { avg_logprob?: number; no_speech_prob?: number }[];
}

const EXT: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav",
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/flac": "flac",
};

export class GroqTranscriber implements Transcriber {
  async translateToEnglish(audio: AudioInput, callLang: CallLang): Promise<Transcript> {
    const { whisperMode, whisperModel } = LANG_MODELS[callLang];
    const mime = audio.mimeType.split(";")[0];
    const path = whisperMode === "transcribe" ? "/audio/transcriptions" : "/audio/translations";
    const res = (await groqFetch(path, () => {
      const form = new FormData();
      const clip: Uint8Array<ArrayBuffer> = new Uint8Array(audio.bytes);
      form.append("file", new Blob([clip], { type: mime }), `clip.${EXT[mime] ?? "webm"}`);
      form.append("model", whisperModel);
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");
      if (whisperMode === "transcribe") form.append("language", "en");
      return form;
    })) as VerboseJson;

    return {
      text_en: (res.text ?? "").trim(),
      segments: (res.segments ?? []).map((s) => ({
        avg_logprob: s.avg_logprob ?? -Infinity,
        no_speech_prob: s.no_speech_prob ?? 1,
      })),
    };
  }
}
