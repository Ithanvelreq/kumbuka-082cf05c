// Every Groq call goes through here: timeout + exactly one retry; 429/5xx/network/timeout -> ServiceBusyError.
import { ServiceBusyError } from "../domain/errors.ts";

const BASE_URL = "https://api.groq.com/openai/v1";
export const GROQ_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;

/** Optional env override. Empty or whitespace counts as unset (secret UIs often create empty values). */
export function envOr(name: string, fallback: string): string {
  return Deno.env.get(name)?.trim() || fallback;
}

export const WHISPER_MODEL = envOr("GROQ_WHISPER_MODEL", "whisper-large-v3");
export const LLM_MODEL = envOr("GROQ_LLM_MODEL", "llama-3.1-8b-instant");

function apiKey(): string {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY is not set");
  return key;
}

const retryable = (status: number) => status === 429 || status >= 500;

/** Non-retryable upstream error (bad request, auth). Surfaces as a 500, not "busy". */
class GroqRequestError extends Error {}

/** `makeBody` is called per attempt so request bodies are never reused after being consumed. */
export async function groqFetch(path: string, makeBody: () => BodyInit, contentType?: string): Promise<unknown> {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey()}` };
      if (contentType) headers["Content-Type"] = contentType;
      const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: makeBody(), signal: controller.signal });
      if (res.ok) return await res.json();
      const text = await res.text();
      lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      if (!retryable(res.status)) {
        // Groq error bodies describe the request problem (model, format), not patient content.
        console.error(`Groq ${path} rejected: ${lastError}`);
        throw new GroqRequestError(`Groq ${path} failed: ${lastError}`);
      }
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(wait) && wait > 0 ? Math.min(wait * 1000, 3000) : 1000);
      }
    } catch (err) {
      if (err instanceof GroqRequestError) throw err;
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(300);
  }
  console.error(`Groq ${path} gave up: ${lastError}`);
  throw new ServiceBusyError();
}

export async function groqChatJson(system: string, user: string, model = LLM_MODEL): Promise<unknown> {
  const res = (await groqFetch(
    "/chat/completions",
    () => JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    "application/json",
  )) as { choices?: { message?: { content?: string } }[] };
  const content = res.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(content); // callers treat a failure as "unclear", never a guess
  } catch (err) {
    // Log shape only, not content: the reply may contain patient data.
    console.error(`Groq chat (${model}) returned non-JSON: ${content.length} chars`);
    throw err;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
