// Instructions shown next to the phone: how a call works and every flow people can try.
import type { ReactNode } from "react";

function K({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-block min-w-[1.4em] rounded border border-slate-300 bg-slate-50 px-1 text-center font-mono text-[0.8em] text-slate-800">
      {children}
    </kbd>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-[#145c4c]">{title}</h2>
      {children}
    </section>
  );
}

export function HowToTest() {
  return (
    <div className="w-full max-w-xl space-y-6 rounded-2xl bg-white p-6 text-sm leading-relaxed text-slate-700 shadow-sm">
      <p>
        This simulates a <b>phone call from any basic phone</b>: a keypad menu, your voice in, a voice out. No app,
        no smartphone. Patient and doctor use the same call.
      </p>

      <Section title="How a call works">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Press the green <b>📞</b> to call. Use the on-screen keypad or your keyboard (<K>Enter</K> = <K>#</K>).
          </li>
          <li>
            Pick a language: <K>1</K> Swahili, <K>2</K> English, <K>3</K> Spanish, <K>4</K> Ukrainian. This only
            decides which models translate for you. <b>Everything is stored in English.</b>
          </li>
          <li>
            Enter the patient number, then <K>#</K>. Enter the PIN, then <K>#</K>.
          </li>
          <li>
            <K>1</K> if you are the patient, <K>2</K> if you are the doctor.
          </li>
        </ol>
        <p className="text-xs text-slate-500">
          To speak, press <b>🎤 Speak now</b> (allow the microphone), then <b>■ Stop &amp; send</b>. No mic? Open
          “Send a sample clip”. <K>*</K> goes back to the menu. Hanging up (red button) wipes everything from the
          phone. 🔊/🔈 turns the spoken prompts on or off.
        </p>
      </Section>

      <Section title="Who to call as">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Demo patient:</b> number <K>1001</K> with any 4–6 digit PIN. Synthetic data with three entries, one of
            them unconfirmed.
          </li>
          <li>
            <b>Create your own patient:</b> type a new number (3–15 digits) and a 4–6 digit PIN. The call says the
            number isn’t registered: press <K>1</K> to register it with that PIN. Write the number and PIN down;
            together they are the only way back to the record.
          </li>
        </ul>
      </Section>

      <Section title="As the patient (press 1)">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <K>1</K> <b>Record a symptom.</b> Say something like “I’ve had a headache for three days, worse in the
            afternoon.” You hear “Saved”. If it wasn’t clear (try the near-silent sample clip, or mumble), you hear
            that a person will check it.
          </li>
          <li>
            <K>2</K> <b>Hear messages from your doctor</b>, translated into the language of this call.
          </li>
        </ul>
      </Section>

      <Section title="As the doctor (press 2)">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <K>1</K> <b>Hear the history:</b> a short spoken summary in your language, plus how many entries are
            unconfirmed. What was actually heard for unclear entries appears on screen.
          </li>
          <li>
            <K>2</K> diagnosis, <K>3</K> prescription, <K>4</K> consultation note: <b>speak it</b>, and it’s stored
            in English exactly as heard, with no AI rewording.
          </li>
          <li>
            <K>5</K> <b>Ask the record a question</b>, e.g. “When did the fever start?”. The answer comes only from
            what was logged, with dates. Try “What does the patient have?” (it refuses: no diagnosis or advice) or
            “Is she allergic to penicillin?” (it says it isn’t in the record).
          </li>
        </ul>
      </Section>

      <Section title="Try the whole loop">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Register a new number as the patient and record a symptom. Hang up.</li>
          <li>Call again as the doctor with the same number and PIN: hear the history, record a prescription, ask a question. Hang up.</li>
          <li>Call as the patient in a different language and hear the prescription, translated.</li>
        </ol>
      </Section>

      <Section title="Safety rules">
        <ul className="list-disc space-y-1 pl-5">
          <li>The AI never diagnoses, prescribes or advises. It only reports what was said.</li>
          <li>Anything uncertain is said as <b>“Unclear, ask a person”</b>, never guessed.</li>
          <li>Audio is never stored: it’s transcribed in memory and wiped.</li>
        </ul>
      </Section>

      <Section title="Today vs. the intended design">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Today (demo): no encryption.</b> Records are stored in plain text, and the PIN isn’t checked yet, so
            any PIN opens a number. AI runs in the cloud (Groq).
          </li>
          <li>
            <b>Intended:</b> everything in the database is encrypted with a key derived from the patient’s PIN, and
            the PIN itself is never stored, not even hashed. Logging in works by successfully decrypting a check
            value. Without the PIN, the data can’t be read, by anyone. The AI runs locally on a small computer
            instead of in the cloud.
          </li>
        </ul>
      </Section>
    </div>
  );
}
