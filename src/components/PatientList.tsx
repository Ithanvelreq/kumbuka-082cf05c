// Demo-only overview of the patients in the database. The backend refuses unless DEMO_SHOW_PATIENTS=true.
import { useState } from "react";
import { api, type CallLang, type PatientOverview } from "@/lib/api";

const LANG_NAME: Record<CallLang, string> = { sw: "Swahili", en: "English", es: "Spanish", uk: "Ukrainian" };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export function PatientList() {
  const [patients, setPatients] = useState<PatientOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await api.listPatients();
    setLoading(false);
    if (res.ok) return setPatients(res.data.patients);
    setPatients(null);
    setError(
      res.status === 403
        ? "The patient list is switched off. To turn it on for the demo, add the secret DEMO_SHOW_PATIENTS = true in Lovable and redeploy the edge functions."
        : res.message,
    );
  }

  return (
    <div className="w-full max-w-xl space-y-3 rounded-2xl bg-white p-6 text-sm text-slate-700 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-[#145c4c]">Patients in the database (demo only)</h2>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 rounded-lg bg-[#145c4c] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Loading…" : patients ? "Refresh" : "Show patients"}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Only for testing: with no encryption and no PIN check today, a patient number is enough to open a record, so
        this list would expose every record. In the intended design records are encrypted with the patient’s PIN, so a
        list of numbers reveals nothing readable. Languages are the ones the patient used for their own recordings;
        patients have no stored language.
      </p>
      {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}
      {patients && patients.length === 0 && <p className="text-xs">No patients yet.</p>}
      {patients && patients.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Number</th>
                <th className="py-1.5 pr-3 font-medium">Name</th>
                <th className="py-1.5 pr-3 font-medium">Entries</th>
                <th className="py-1.5 pr-3 font-medium">History</th>
                <th className="py-1.5 font-medium">Languages</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-3 font-mono">{p.id}</td>
                  <td className="py-1.5 pr-3">{p.display_name ?? <span className="text-slate-400">—</span>}</td>
                  <td className="py-1.5 pr-3">{p.entries}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {p.entries === 0 ? "—" : `${day(p.first_entry_at)} → ${day(p.last_entry_at)}`}
                  </td>
                  <td className="py-1.5">{p.languages.length ? p.languages.map((l) => LANG_NAME[l]).join(", ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
