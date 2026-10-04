import { useRef, useState } from "react";
import type { AudioPayload } from "./api";

export async function blobToPayload(blob: Blob): Promise<AudioPayload> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { base64: btoa(bin), mime_type: blob.type || "audio/webm" };
}

export async function fetchClip(url: string): Promise<AudioPayload> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Clip not found: ${url}`);
  return blobToPayload(await res.blob());
}

/** In-browser recording. The clip only lives in memory until it is sent. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    chunks.current = [];
    rec.ondataavailable = (e) => chunks.current.push(e.data);
    rec.start();
    recorder.current = rec;
    setRecording(true);
  }

  function stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = recorder.current!;
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        resolve(new Blob(chunks.current, { type: rec.mimeType }));
        chunks.current = [];
      };
      rec.stop();
    });
  }

  return { recording, start, stop };
}
