# Kumbuka – small AI health ledger (hackathon demo)

A phone-accessible medical ledger for patients with basic phones. Persona: Noor, rural Ondera, Swahili speaker.
Full plan: [`docs/plan.md`](docs/plan.md).

It's a **phone call from any throwaway basic phone**, not an app. The keypad menu goes:

> "Kwa Kiswahili bonyeza 1. For English press 2." → patient number `#` → PIN `#` → "patient press 1, doctor press 2"

There's no doctor login. The doctor uses the same call with the patient's number and PIN (the patient's consent).

- **Flow 1 – patient records a symptom:** speech → Whisper → English → small LLM structures it → `symptom_log` event.
- **Flow 2 – doctor hears the history:** all events → an English summary → translated into the call language (same check as message playback) → read out. If the translation can't be trusted, the doctor hears the English summary, introduced as such.
- **Flow 3 – doctor records a diagnosis/prescription:** speech → Whisper → the **English transcript is stored as-is** (no LLM rewording). The patient hears it later, translated into their call language.

**Storage is always English.** The language picked at the start of the call only selects which models translate at the edges ([`languages.ts`](supabase/functions/_shared/infra/languages.ts)):

| Call language | Speech in | Speech/text out |
|---|---|---|
| English (2) | Whisper *transcription* | as stored, no LLM |
| Swahili (1) | Whisper *translation* → English | LLM writes Swahili (`GROQ_LLM_MODEL_SW` overridable) |

## What is live vs. planned (read this)

| | This demo (live) | Intended production design (planned) |
|---|---|---|
| Inference | **Cloud**: Groq API (`whisper-large-v3`, `openai/gpt-oss-20b`) | **Local** on a mini-PC: Whisper small + a small open LLM with a commercial license, on CPU |
| PIN login check | **Stub** (`NoOpPinCrypto`): any PIN is accepted, login only checks the ID exists | `pin_check` = ID encrypted with a PIN-derived key (PBKDF2/Argon2 + AES-GCM). The PIN is never stored |
| Data at rest | **Plaintext** (`PlainStorage`) | `EncryptedStorage`: content encrypted with a PIN-derived key |
| Doctor access | Patient number + PIN on the call, then "press 2" (no doctor identity) | Same, plus one-time share codes / clinician verification |
| Delivery | Browser basic-phone simulator (keypad, on-screen prompts, optional browser TTS) | Real telephony (IVR) on any basic phone |

Both stubs are swapped with **one line** in [`supabase/functions/_shared/infra/container.ts`](supabase/functions/_shared/infra/container.ts).

## Safety rules (enforced in code, not just prompts)

- The AI never diagnoses, prescribes, assesses severity, suggests causes or reassures. It only extracts or translates what was said. The rules are in every prompt ([`prompts.ts`](supabase/functions/_shared/infra/prompts.ts)).
- Every AI output is a draft. Uncertain entries get `needs_review: true` and are shown as **"Unclear, ask a person"**, with the English transcript visible to the clinician. Rules ([`needs-review.ts`](supabase/functions/_shared/domain/needs-review.ts)):
  low Whisper `avg_logprob` (< -0.8) or high `no_speech_prob` (> 0.5), LLM `confidence: "low"`, empty note or very short transcript, JSON parse/validation failure.
- Doctor messages are translated only at playback ([`inbox.ts`](supabase/functions/_shared/use-cases/inbox.ts)). If the translation is low-confidence, fails, or changes any number (doses, dates), the message is **not played**. The patient hears "unclear, ask a person".
- **No audio is persisted.** Audio arrives as base64, is decoded in memory, sent to Whisper, and the buffer is zeroed right after transcription, even on failure. Nothing writes audio to disk, storage buckets or the DB.
- Minimal data: the summary prompt only sees date, type, note and flag, never raw transcripts.
- Prompt texts in Swahili ([`call-flow.ts`](src/lib/call-flow.ts)) still need review by a native speaker.
- Every Groq call has a 15s timeout and one retry. 429/5xx/timeouts become HTTP 503, and the UI shows **"Service busy, try again"**.

## Architecture (hexagonal)

Import direction: **infra → use cases → domain**, never outward. `tests/architecture.test.ts` enforces this.

```
src/                                   basic-phone call simulator (Lovable TanStack Start template); route src/routes/index.tsx,
                                       phone src/components/BasicPhone.tsx, menu logic src/lib/call-flow.ts
supabase/migrations/                   patients, events, synthetic seed (RLS on, no policies)
supabase/functions/
  _shared/domain/                      pure: types, schema (content validation), needs-review, ports, errors
  _shared/use-cases/                   ingest, retrieve, log-instruction, inbox, auth (import domain only)
  _shared/infra/                       Supabase storage, Groq transcriber/summarizer, prompts, HTTP, container
  ingest/ retrieve/ log-instruction/ inbox/ auth/   thin Deno handlers: parse → use case → JSON
```

Shared code lives under `_shared/` (underscore = not deployed as a function, per Supabase convention).
`inbox` isn't in the original plan. It's how the patient phone reads flow 3's messages.

### API

All functions are `POST` with a JSON body. Audio is `{ "base64": "...", "mime_type": "audio/webm" }`.
`call_lang` is `"sw"` or `"en"`. It only picks models; storage is English.

| Function | Body | Returns |
|---|---|---|
| `auth` | `{ action: "signup" \| "login", id, pin }` (`id` = numeric patient number) | `{ patient }` |
| `ingest` | `{ patient_id, pin, call_lang, audio }` | `{ event }` |
| `retrieve` | `{ patient_id, pin, call_lang }` | `{ summary, empty, fallback, entries[] }` |
| `log-instruction` | `{ patient_id, pin, call_lang, type, audio }` | `{ event }` |
| `inbox` | `{ patient_id, pin, call_lang }` | `{ messages[] }` (text in `call_lang`, or `null` = unclear) |

Errors: `400 invalid_input`, `404 not_found`, `503 service_busy`, `500 internal`.

## Setup (Lovable Cloud)

This repo is connected to a [Lovable project](https://lovable.dev/projects/9ff1bc4f-0f7a-4e0d-b375-b5e843e09652) with **Lovable Cloud** as the backend (Supabase underneath). `main` syncs both ways with Lovable, so **never force-push or rewrite history on `main`** (see `AGENTS.md`). Work in branches and PRs.

Lovable owns these files; don't hand-edit them: `src/integrations/supabase/*`, `.env` (publishable values only), `supabase/config.toml` `project_id`, `src/routeTree.gen.ts`.

One-time backend setup, done through Lovable's chat:

1. **Database:** "Apply the SQL migrations in `supabase/migrations` in filename order: patients, events, seed." Lovable shows each one for approval.
   Both tables intentionally have RLS **on with no policies**: only the edge functions (service role) can touch them. If Lovable's security check suggests adding policies, decline.
2. **Secret:** add `GROQ_API_KEY` (free key at console.groq.com) when Lovable prompts for it, or in the Cloud secrets settings. Optional overrides: `GROQ_WHISPER_MODEL`, `GROQ_LLM_MODEL`, `GROQ_WHISPER_MODEL_SW`, `GROQ_LLM_MODEL_SW`. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.
3. **Edge functions:** "Deploy the edge functions in `supabase/functions`: auth, ingest, retrieve, log-instruction, inbox." `supabase/config.toml` sets `verify_jwt = false` for them, because the app calls them with the publishable key, which isn't a JWT.
4. **After every merge that touches `supabase/functions/`**, ask Lovable's chat to "Redeploy all edge functions". Merging alone doesn't redeploy them; the app keeps running the old backend code until you ask.
5. **Demo clips:** put pre-recorded Swahili clips in `public/clips/` and list them in `src/lib/clips.ts`. `silence.wav` (near-silent, generated) is included to show the `needs_review` fail-safe.

## Local dev and checks

```sh
bun install
bun run dev        # http://localhost:8080 (uses the Cloud backend from .env)
bun run typecheck  # app (TanStack Start) + domain/use-cases
bun run test       # vitest: app routing + domain/use-case tests in tests/ (no network)
bun run build
```

CI (`.github/workflows/ci.yml`) runs the same on every PR and on `main`.
The infra and handler files use Deno `npm:` imports, so `tsc` doesn't check them; CI runs `deno check supabase/functions/*/index.ts` (locally: `npx deno check …`).

## Demo script

Press 📞 to call. Use the on-screen keypad or your keyboard (Enter = `#`). Hang up (⏻) between roles.

1. **Patient call:** `1` (Swahili) → `1001#` (synthetic demo patient) → any PIN `1234#` → `1` patient → `1` record a symptom → speak, or send a demo clip → "Imehifadhiwa". Do it again with `silence.wav` → "…haikueleweka vizuri. Mtu ataikagua." (the fail-safe).
2. **Doctor call:** `2` (English) → `1001#` → `1234#` → `2` doctor → `1` hear history: a short English summary, plus the transcripts of unclear entries on screen. Then `3` → speak a prescription → "Saved."
3. **Patient call again:** `1` → `1001#` → `1234#` → `1` → `2` hear messages → the prescription is read in Swahili.
4. A fresh number (e.g. `2002#`) → "not registered, press 1 to register".

## Demo-readiness checklist

- [ ] Whole loop over the call menu from a fresh number: register → record symptom → doctor hears history → doctor records prescription → patient hears it
- [x] One clip that triggers `needs_review` (`public/clips/silence.wav`)
- [x] No audio persisted (in-memory only, buffer zeroed after transcription; see `ingest.ts`, `log-instruction.ts`)
- [x] No secrets in the repo (`.env*` ignored; keys via Lovable/Supabase secrets)
- [x] README states live vs planned (table above)
- [ ] Real Swahili demo clips added to `public/clips/`

## Seed data

Patient `1001` and its three entries are **synthetic**, not a real person. One entry is pre-flagged `needs_review` so the fail-safe shows up on the first retrieval.
