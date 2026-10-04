// Shared Deno HTTP plumbing for edge handlers: CORS, JSON, error mapping, input parsing.
import { NotFoundError, ServiceBusyError, ValidationError } from "../domain/errors.ts";
import type { AudioInput } from "../domain/ports.ts";
import { CALL_LANGS, type CallLang, isCallLang } from "../domain/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export function handler(fn: (body: Record<string, unknown>) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      const body = await req.json().catch(() => {
        throw new ValidationError("Body must be JSON");
      });
      if (typeof body !== "object" || body === null) throw new ValidationError("Body must be a JSON object");
      return json(await fn(body as Record<string, unknown>));
    } catch (err) {
      if (err instanceof ServiceBusyError) return json({ error: "service_busy", message: err.message }, 503);
      if (err instanceof ValidationError) return json({ error: "invalid_input", message: err.message }, 400);
      if (err instanceof NotFoundError) return json({ error: "not_found", message: err.message }, 404);
      console.error(err);
      return json({ error: "internal", message: "Something went wrong" }, 500);
    }
  };
}

export function requireString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== "string" || v.trim() === "") throw new ValidationError(`${key} is required`);
  return v.trim();
}

export function optionalString(body: Record<string, unknown>, key: string, fallback: string): string {
  const v = body[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : fallback;
}

/** Language chosen at the start of the call (1 Swahili, 2 English, 3 Spanish, 4 Russian). */
export function requireCallLang(body: Record<string, unknown>, key = "call_lang"): CallLang {
  const v = body[key];
  if (!isCallLang(v)) throw new ValidationError(`${key} must be one of ${CALL_LANGS.join(", ")}`);
  return v;
}

/** `audio` = { base64, mime_type }. Decoded in memory only; never written to disk or storage. */
export function parseAudio(body: Record<string, unknown>): AudioInput {
  const a = body.audio as { base64?: unknown; mime_type?: unknown } | undefined;
  if (!a || typeof a.base64 !== "string" || typeof a.mime_type !== "string") {
    throw new ValidationError("audio must be { base64, mime_type }");
  }
  if (a.base64.length * 0.75 > MAX_AUDIO_BYTES) throw new ValidationError("audio too large");
  const bin = atob(a.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mimeType: a.mime_type };
}
