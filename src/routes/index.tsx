import { createFileRoute } from "@tanstack/react-router";
import { BasicPhone } from "@/components/BasicPhone";
import { HowToTest } from "@/components/HowToTest";

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
    <main className="min-h-screen bg-slate-100 p-6">
      <header className="mx-auto max-w-md">
        <h1>
          <img
            src="/kumbuka-logo.png"
            alt="Kumbuka – Health history. Speak it once. Keep it always."
            width={1400}
            height={355}
            className="h-auto w-full"
          />
        </h1>
      </header>
      <div className="mx-auto mt-8 flex max-w-6xl flex-col items-center gap-8 lg:flex-row lg:items-start lg:justify-center">
        {/* The phone stays in view while the instructions scroll beside it. */}
        <div className="lg:sticky lg:top-6">
          <BasicPhone />
        </div>
        <HowToTest />
      </div>
    </main>
  );
}
