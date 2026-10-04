import { useState } from "react";
import type { AudioPayload } from "@/lib/api";
import { blobToPayload, fetchClip, useRecorder } from "@/lib/audio";
import { CLIPS } from "@/lib/clips";

export interface PickedAudio {
  payload: AudioPayload;
  label: string;
}

/** Choose a pre-recorded clip or record one. Calls onReady with the in-memory clip. */
export function AudioPicker({ disabled, onReady }: { disabled?: boolean; onReady: (a: PickedAudio) => void }) {
  const [clip, setClip] = useState(CLIPS[0]?.url ?? "");
  const [error, setError] = useState<string | null>(null);
  const rec = useRecorder();

  async function useClip() {
    setError(null);
    try {
      onReady({ payload: await fetchClip(clip), label: CLIPS.find((c) => c.url === clip)?.label ?? clip });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load clip");
    }
  }

  async function toggleRecord() {
    setError(null);
    try {
      if (!rec.recording) return await rec.start();
      onReady({ payload: await blobToPayload(await rec.stop()), label: "Recorded clip" });
    } catch {
      setError("Microphone not available");
    }
  }

  const btn = "rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-xs" value={clip} onChange={(e) => setClip(e.target.value)}>
          {CLIPS.map((c) => (
            <option key={c.url} value={c.url}>{c.label}</option>
          ))}
        </select>
        <button className={`${btn} bg-emerald-600 text-white`} disabled={disabled || !clip || rec.recording} onClick={useClip}>
          Send clip
        </button>
      </div>
      <button className={`${btn} ${rec.recording ? "bg-red-600 text-white" : "bg-slate-200"}`} disabled={disabled} onClick={toggleRecord}>
        {rec.recording ? "■ Stop & send" : "🎤 Record"}
      </button>
      {error && <div className="text-xs text-red-700">{error}</div>}
    </div>
  );
}
