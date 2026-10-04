# Build plan: Small AI health ledger (hackathon, 4 hours)

Read this fully before writing code. Work in the order given in "Build order". Keep it simple: a working end-to-end loop beats extra features.

## 1. What we are building

A phone-accessible medical ledger for a patient with a basic phone (persona: Noor, rural Ondera, Swahili speaker).

It works like a **phone call from any throwaway basic phone**, not a smartphone app. Patient and doctor use the same call (often the patient's phone, handed to the doctor). The call goes:

1. "For Swahili press 1, for English press 2."
2. Enter the patient number, then `#`.
3. Enter the PIN, then `#`. (Unknown number: press 1 to register with this PIN.)
4. "If you are the patient press 1, if you are the doctor press 2."

There is no doctor login. The doctor gets access to a patient's record by being given the patient number and PIN, which is the patient's consent.

- **Flow 1, patient logs a symptom:** the patient speaks -> Whisper (to English) -> small LLM structures it into JSON -> stored in Supabase.
- **Flow 2, doctor retrieves history:** doctor presses 1 -> entries read from Supabase -> the LLM writes a short summary (about 20 seconds when read aloud) in the call language.
- **Flow 3, doctor records diagnosis/prescription:** the doctor *speaks* it (a keypad call has no typing) -> Whisper -> the English transcript is stored as an `events` row (`doctor_diagnosis`, `doctor_prescription`, or a `symptom_log` consult note). When the patient later presses "hear messages", it is translated into that call's language and played back. No length cap: the doctor's speech is passed through in full.

**Storage language is always English.** The language chosen at the start of the call never changes what is stored. It only selects which models do the translation at the edges:

- English call: Whisper *transcribes*, and no output translation is needed.
- Swahili call: Whisper *translates* speech into English, and the LLM writes output in Swahili.

The per-language model table lives in one infra file.

## 2. Hard rules (do not violate)

- Never diagnose, prescribe, interpret imaging, assess severity, suggest causes, or say "you are fine". Extract and report only what the patient said.
- Every AI output is a draft. Anything uncertain is flagged `needs_review` and shown as "Unclear, ask a person" instead of guessing.
- No audio is persisted. Process audio in memory, discard it right after transcription.
- Minimal data. Nothing sensitive in the summary text beyond what was reported.
- Be honest in the UI and docs: the demo calls cloud inference (Groq); the intended production design is local inference on a mini-PC (Whisper small + a small open LLM under a commercial license, on CPU) with PIN-derived encryption.

## 3. Stack

- **Lovable** project synced to a GitHub repo. Everything as code: TypeScript, Deno edge functions, SQL migrations. No console-only state.
- **Supabase Postgres** for storage.
- **Groq** for inference (free tier, no card). Check Groq's current model list for a Whisper model (supports `verbose_json` with per-segment `avg_logprob`) and a small instruct model with JSON output. Pick models from the live list, do not assume names.
- **Secrets** (Groq key, Supabase service key) go through Lovable's built-in secrets and are read as environment variables. Never hardcode or commit them.

## 4. Architecture (hexagonal)

Three layers, strict import direction: **infra -> use cases -> domain**. Nothing ever imports outward.

- **Domain (center):** pure types, no I/O, no Supabase/Groq imports. This is the `events`/`patients` model from section 5 — the `Patient` type, the `EventType` union, the four `content` shapes, `needs_review` logic as a pure function. Also the `Storage` interface (the port) lives here, not its implementation.
- **Use cases:** the four flows (ingest, retrieve, log-instruction, auth). Each one is a plain function that takes its inputs plus injected ports (`Storage`, a `Transcriber` port, a `Summarizer`/LLM port) and returns domain types. Use cases import **only** from domain — never from Supabase SDK, Groq SDK, or Deno/HTTP specifics directly.
- **Infra (edges):** everything concrete — `SupabaseStorage` implementing the `Storage` port, `GroqTranscriber` and `GroqSummarizer` implementing the LLM ports, the Deno edge function HTTP handlers that parse a request, call a use case, and serialize the response. This is also where `PlainStorage` vs `EncryptedStorage` (section 7) gets swapped in.

This keeps the hard rules in section 2 (never diagnose, always flag `needs_review`, no audio persisted) enforceable and testable in the use-case layer, independent of which LLM or database you're actually hitting.

## 5. Repo layout (suggested)

```
/src                                phone simulator UI
  /components                       BasicPhone (keypad call), AudioPicker
/supabase
  /migrations                       SQL files, ordered: patients, events
  /functions
    /domain
      types.ts                      Patient, Event, EventType, the four content shapes
      needs-review.ts                pure needs_review rules (section 5's "Confidence and needs_review")
      ports.ts                      Storage, Transcriber, Summarizer interfaces (no implementations)
    /use-cases
      ingest.ts                     flow 1: audio -> transcript -> structured symptom_log -> store
      retrieve.ts                   flow 2: patient id -> short spoken summary in call_lang
      log-instruction.ts            flow 3: doctor audio -> English diagnosis/prescription event -> store
      auth.ts                       signup + login check (ID + PIN)
    /infra
      supabase-storage.ts           Storage port implementation (Plain, later Encrypted)
      groq-transcriber.ts           Transcriber port implementation (Whisper via Groq)
      groq-summarizer.ts            Summarizer port implementation (small instruct model via Groq)
      prompts.ts                    all prompts in one place
    /ingest                         Deno handler: parse request -> call use-cases/ingest -> respond
    /retrieve                       Deno handler: parse request -> call use-cases/retrieve -> respond
    /log-instruction                Deno handler: parse request -> call use-cases/log-instruction -> respond
    /auth                           Deno handler: parse request -> call use-cases/auth -> respond
```

## 6. Data model

Migration order matters (foreign keys point to `patients`). Single unified timeline table (`events`) instead of separate tables per kind of entry — one place to read to reconstruct a patient's whole history.

```sql
-- Table patients: stable info, doesn't change per log
patients(
  id text primary key,          -- user ID, plaintext
  display_name text,
  pin_check text,                -- id, encrypted with a key derived from the PIN. PIN itself is never stored.
  created_at timestamptz default now()
)

-- Table events: unified timeline (symptoms, diagnoses, prescriptions, lab results)
events(
  id uuid primary key default gen_random_uuid(),
  patient_id text references patients(id),
  type text not null,           -- 'symptom_log' | 'doctor_diagnosis' | 'doctor_prescription' | 'lab_result'
  content jsonb not null,       -- shape depends on `type`, validated in code (schema.ts)
  source_lang text,             -- e.g. 'sw'
  created_at timestamptz default now()
)
```

### PIN verification (no PIN storage)

The PIN is never persisted anywhere, not even hashed. Instead, at signup, `patients.id` is encrypted with a key derived from the PIN and stored in `pin_check`. At login, the PIN the user types is used to derive the same key and decrypt `pin_check`; if the result equals `patients.id`, the PIN is correct. This needs a `PinCrypto` port in the domain:

```ts
interface PinCrypto {
  encryptCheck(id: string, pin: string): string;   // used at signup
  verifyPin(id: string, pin: string, pinCheck: string): boolean;  // used at login
}
```

- **Now:** `NoOpPinCrypto` does nothing real — signup just stores `id` as-is in `pin_check` (or a trivial reversible marker), `verifyPin` always returns `true` for the demo. Clearly labeled as a stub in code and in the README.
- **Later, if time:** real implementation (e.g. AES with a key derived from the PIN via PBKDF2/Argon2, `verifyPin` does the actual decrypt-and-compare). Swapping `NoOpPinCrypto` for the real one is a one-line change at injection time, same pattern as `Storage` in section 7.

Note: auth itself is not being wired into the demo flow yet (see section 9's `auth` note) — this `PinCrypto` port is prepared now so it drops in cleanly once auth is connected.

No `status` column on the table: `needs_review` lives inside `content` and is the single source of truth. Filter with `where content->>'needs_review' = 'true'` rather than keeping a separate status in sync.

### Content JSON by `type` (default schemas, adjust if needed but keep in `schema.ts` only)

All four types share a fixed core (`note_en`, `confidence`, `needs_review`, `review_reason`) plus a free-form `details` object for anything not worth locking down. Fields not stated are `null`. Never infer.

**`type = 'symptom_log'`** — logged by the patient herself, or by a doctor recapping what she said during a consult.
```json
{
  "reported_by": "patient | doctor",
  "note_en": "string, faithful short English note",
  "confidence": "high | medium | low",
  "needs_review": false,
  "review_reason": "string or null",
  "details": { }
}
```

**`type = 'doctor_diagnosis'`** — what the doctor believes is going on.
```json
{
  "note_en": "string",
  "confidence": "high | medium | low",
  "needs_review": false,
  "review_reason": "string or null",
  "details": { }
}
```

**`type = 'doctor_prescription'`** — medication or treatment prescribed.
```json
{
  "note_en": "string",
  "confidence": "high | medium | low",
  "needs_review": false,
  "review_reason": "string or null",
  "details": { }
}
```

**`type = 'lab_result'`** — measured data (labs, imaging reports, etc.), not self-reported.
```json
{
  "note_en": "string",
  "confidence": "high | medium | low",
  "needs_review": false,
  "review_reason": "string or null",
  "test_name": "string or null",
  "result_value": "string or null",
  "details": { }
}
```

Use constrained/JSON-mode output. The code, not Postgres, is responsible for validating that `content` matches the expected shape for its `type` before insert.

### Confidence and `needs_review`

Set `needs_review = true` on the entry if any of these hold:

1. Whisper segments have low `avg_logprob` or high `no_speech_prob` (start with conservative thresholds, make them constants).
2. The LLM self-reports `confidence: "low"`.
3. `note_en` is empty or the transcript is very short.
4. JSON parsing or validation fails (return an "unclear" result, never a guess).

The UI shows `needs_review` entries as "Unclear, ask a person" with the English transcript visible for the clinician.

## 7. Storage wrapper (dependency injection)

All reads and writes of `events` go through one module, `_shared/storage.ts`. Edge functions never touch the tables directly.

```ts
interface Storage {
  store(patientId: string, data: unknown, pin: string): Promise<void>;
  retrieve(patientId: string, pin: string): Promise<unknown[]>;
}
```

The `pin` parameter here is only ever used as key material for encrypting/decrypting `content` — it is never compared against anything stored, and it is unrelated to the `PinCrypto`/`pin_check` login check in section 6 (that one verifies identity; this one is about encrypting data at rest).

- **Now:** `PlainStorage` ignores `pin` entirely and writes `content` in cleartext.
- **Later, if time:** `EncryptedStorage` derives a key from the PIN with a KDF (e.g. PBKDF2 or Argon2), encrypts `content` before insert, decrypts on read, and the PIN itself is never stored anywhere. Swapping implementations must be a one-line change at injection time, with no signature changes.

## 8. Edge functions

Each function validates input, calls `storage`, returns JSON, and handles errors (see section 9).

- All functions take `call_lang` (`sw` | `en`), which only picks models. Nothing is stored in it except `source_lang` as metadata.
- **`ingest`:** input `{ patient_id, pin, call_lang, audio }`. Transcribe + translate to English with Whisper, discard audio, structure with the LLM (prompt rules in section 2) into a `symptom_log` event (`reported_by: 'patient'`), compute `needs_review`, store.
- **`retrieve`:** input `{ patient_id, pin, call_lang }`. Load all `events` for the patient, then one LLM call that summarizes and writes in `call_lang`. Output must be short (about 20 seconds read aloud), only report what was logged, mark any `needs_review` entries as unconfirmed. Empty history returns "No entries yet".
- **`log-instruction`:** input `{ patient_id, pin, call_lang, type, audio }` where `type` is `doctor_diagnosis` or `doctor_prescription` (or `symptom_log` with `reported_by: 'doctor'` for a consult note). Whisper turns the audio into English (same as `ingest`, audio discarded right after). The English transcript is stored as-is, with no LLM rewording and no length cap.
- **`inbox`:** input `{ patient_id, pin, call_lang }`. Returns doctor messages translated from the stored English into `call_lang` at playback. If the translation is low-confidence, fails, or changes any number (doses, dates), the message is not played: it says "unclear, ask a person" instead.
- **`auth`:** **not wired in yet for this build** — the `PinCrypto` port (section 6) is defined so it's ready to plug in, but for now the demo skips real auth: `signup` creates `{id}` (numeric patient number, typed on a keypad) and stores a `pin_check` via `NoOpPinCrypto`, `login` just checks the ID exists. No sessions: the call holds the number and PIN until hang-up. Wire up real PIN verification later if time allows.

## 9. Frontend (call simulator)

One basic phone: a small screen, a keypad (`0-9 * #`), and call / hang-up buttons. It simulates a voice call, not an app.

- **Menu:** language (1 Swahili, 2 English) -> patient number `#` -> PIN `#` -> role (1 patient, 2 doctor). Prompts are shown as "🔊" lines, with optional browser text-to-speech.
- **Patient menu:** 1 record a symptom (speak), 2 hear doctor messages.
- **Doctor menu:** 1 hear history, 2 record diagnosis, 3 record prescription, 4 record consultation note.
- "Speaking" = recording from the mic or picking a pre-recorded demo clip. `*` goes back.
- `needs_review` items are said as "Unclear, ask a person". For the doctor, the English transcript of unclear entries is shown on screen.
- Hanging up wipes all state on the phone.

## 10. Errors, empty states, seed data

- Wrap every Groq call with a timeout and one retry. On final failure show "Service busy, try again" in the UI, never a frozen screen.
- Handle Groq rate limits (HTTP 429) the same way.
- Empty history: "No entries yet".
- Seed 2 or 3 realistic English entries for a demo patient (clearly labeled synthetic) so retrieval looks good from the first run.

## 11. Build order

1. Repo + GitHub sync, secrets configured, migrations for the two tables (`patients`, `events`).
2. Domain layer: `types.ts`, `needs-review.ts`, `ports.ts`. Infra: `supabase-storage.ts` (PlainStorage implementing the `Storage` port).
3. Use case `ingest.ts` + infra (`groq-transcriber.ts`, `groq-summarizer.ts`) + Deno handler, end to end with a hardcoded test clip. Verify JSON output and the `needs_review` path with one deliberately bad clip.
4. Use case `retrieve.ts` + Deno handler, with seed data.
5. Call simulator UI (keypad menu: language, number, PIN, role).
6. Use case `log-instruction.ts` (audio) + `inbox` playback + Deno handlers + their menu entries.
7. Error handling and empty states.
8. Stretch only if time remains: `EncryptedStorage`, one-time share code (missed call -> code with expiry), real telephony.

## 12. Demo-readiness checklist

- Whole loop works from a fresh number over the call menu: register, log a symptom, doctor retrieves, doctor records a prescription, patient hears it.
- One clip that triggers `needs_review` is ready to show the fail-safe.
- No audio persisted anywhere (check the code path).
- No secrets in the repo.
- README states clearly what is live versus planned: cloud inference vs local, plaintext PIN vs PIN-derived encryption.
