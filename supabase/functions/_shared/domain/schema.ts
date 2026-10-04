// The single place where `content` shapes are validated before insert.
import type { Confidence, ContentByType, ContentCore, EventType } from "./types.ts";
import { EVENT_TYPES } from "./types.ts";

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const CONFIDENCES: readonly Confidence[] = ["high", "medium", "low"];

export function isEventType(v: unknown): v is EventType {
  return typeof v === "string" && (EVENT_TYPES as readonly string[]).includes(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nullableString(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function validateCore(c: Record<string, unknown>): string | null {
  if (typeof c.note_en !== "string") return "note_en must be a string";
  if (!CONFIDENCES.includes(c.confidence as Confidence)) return "confidence must be high|medium|low";
  if (typeof c.needs_review !== "boolean") return "needs_review must be boolean";
  if (!nullableString(c.review_reason)) return "review_reason must be string or null";
  if (!isObject(c.details)) return "details must be an object";
  return null;
}

export function validateContent<T extends EventType>(type: T, content: unknown): ValidationResult<ContentByType[T]> {
  if (!isObject(content)) return { ok: false, error: "content must be an object" };
  const coreError = validateCore(content);
  if (coreError) return { ok: false, error: coreError };

  if (type === "symptom_log" && content.reported_by !== "patient" && content.reported_by !== "doctor") {
    return { ok: false, error: "reported_by must be patient|doctor" };
  }
  if (type === "lab_result" && (!nullableString(content.test_name) || !nullableString(content.result_value))) {
    return { ok: false, error: "test_name/result_value must be string or null" };
  }
  return { ok: true, value: content as unknown as ContentByType[T] };
}

/** Normalize loose LLM output into the fixed core. Missing fields become null/empty, never inferred. */
export function coerceCore(raw: unknown): ContentCore | null {
  if (!isObject(raw)) return null;
  const confidence = CONFIDENCES.includes(raw.confidence as Confidence) ? (raw.confidence as Confidence) : "low";
  return {
    note_en: typeof raw.note_en === "string" ? raw.note_en.trim() : "",
    confidence,
    needs_review: false,
    review_reason: null,
    details: isObject(raw.details) ? raw.details : {},
  };
}
