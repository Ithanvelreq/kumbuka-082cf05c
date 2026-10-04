import { createFileRoute } from "@tanstack/react-router";
import { BasicPhone } from "@/components/BasicPhone";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kumbuka – Health history. Speak it once. Keep it always." },
      { name: "description", content: "A health ledger you reach by calling from any basic phone." },
      { property: "og:title", content: "Kumbuka – Health history. Speak it once. Keep it always." },
      { property: "og:description", content: "A health ledger you reach by calling from any basic phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-slate-100 p-6">
      <header className="max-w-xl text-center">
        <h1>
          <img
            src="/kumbuka-logo.png"
            alt="Kumbuka – Health history. Speak it once. Keep it always."
            width={1400}
            height={355}
            className="mx-auto h-auto w-full max-w-md"
          />
        </h1>
        <p className="mt-3 text-xs text-slate-600">
          Simulates a call from any basic phone: keypad menu, voice in, voice out. Patient and doctor use the same call
          (press 1 or 2). Every AI output is a draft; it never diagnoses or advises. Records are stored in English.
          Demo uses cloud inference (Groq) and stores data unencrypted; the intended design runs locally on a mini-PC
          with PIN-derived encryption. Demo patient: number <b>1001</b>, any 4-digit PIN.
        </p>
      </header>
      <BasicPhone />
    </main>
  );
}
