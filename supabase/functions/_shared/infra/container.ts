// Composition root: the ONE place implementations are chosen.
// Swapping PlainStorage -> EncryptedStorage, or NoOpPinCrypto -> a real one, is a one-line change here.
import { GroqSummarizer } from "./groq-summarizer.ts";
import { GroqTranscriber } from "./groq-transcriber.ts";
import { NoOpPinCrypto } from "./pin-crypto.ts";
import { serviceClient } from "./supabase-client.ts";
import { PlainStorage, SupabasePatientStore } from "./supabase-storage.ts";

export function makeDeps() {
  const db = serviceClient();
  return {
    storage: new PlainStorage(db),
    patients: new SupabasePatientStore(db),
    pinCrypto: new NoOpPinCrypto(),
    transcriber: new GroqTranscriber(),
    summarizer: new GroqSummarizer(),
  };
}
