// A throwaway basic phone on a call: everything happens through the keypad and the voice.
// Hanging up wipes all state; nothing about the call is kept on the phone.
import { useEffect, useRef, useState } from "react";
import { api, type ApiResult, type AudioPayload } from "@/lib/api";
import {
  afterLogin,
  afterRegister,
  audioCaptured,
  backToMenu,
  type CallState,
  type Effect,
  initialState,
  LANG_PROMPT,
  press,
  startCall,
  t,
  type Transition,
} from "@/lib/call-flow";
import { AudioPicker, type PickedAudio } from "./AudioPicker";

interface Line {
  id: number;
  kind: "voice" | "key" | "note";
  text: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const SPEECH_LANG = { sw: "sw-KE", en: "en-US" } as const;

export function BasicPhone() {
  const [state, setState] = useState<CallState>(initialState);
  const [lines, setLines] = useState<Line[]>([]);
  const [speaker, setSpeaker] = useState(false);
  const stateRef = useRef(state);
  const callId = useRef(0);
  const lineId = useRef(0);
  const pendingAudio = useRef<AudioPayload | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    screenRef.current?.scrollTo({ top: screenRef.current.scrollHeight });
  }, [lines]);

  function addLines(kind: Line["kind"], texts: string[], lang = stateRef.current.lang) {
    if (texts.length === 0) return;
    setLines((prev) => [...prev, ...texts.map((text) => ({ id: ++lineId.current, kind, text }))]);
    if (kind === "voice" && speaker && "speechSynthesis" in window) {
      for (const text of texts) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = text === LANG_PROMPT ? "sw-KE" : SPEECH_LANG[lang];
        window.speechSynthesis.speak(u);
      }
    }
  }

  function apply(tr: Transition) {
    stateRef.current = tr.state;
    setState(tr.state);
    addLines("voice", tr.say, tr.state.lang);
    if (tr.effect) void run(tr.effect, tr.state, callId.current);
  }

  /** Error text to say: validation messages as-is, everything else is "busy". */
  function failure(res: Extract<ApiResult<unknown>, { ok: false }>, s: CallState) {
    return res.status === 400 || res.status === 404 ? res.message : t(s.lang, "busy");
  }

  async function run(effect: Effect, s: CallState, id: number) {
    const live = () => id === callId.current; // ignore results that arrive after hang-up
    switch (effect.type) {
      case "login": {
        const res = await api.login(s.number, s.pin);
        if (!live()) return;
        return apply(afterLogin(s, res.ok ? "ok" : res.status === 404 ? "not_found" : { error: failure(res, s) }));
      }
      case "register": {
        const res = await api.signup(s.number, s.pin);
        if (!live()) return;
        return apply(afterRegister(s, res.ok ? "ok" : { error: failure(res, s) }));
      }
      case "retrieve": {
        const res = await api.retrieve(s.number, s.pin, s.lang);
        if (!live()) return;
        if (!res.ok) return apply(backToMenu(s, [failure(res, s)]));
        const { summary, empty, entries } = res.data;
        if (empty) return apply(backToMenu(s, [t(s.lang, "no_entries")]));
        const flagged = entries.filter((e) => e.needs_review);
        // Clinician view only (screen, not voice): what was actually heard, in English.
        addLines("note", flagged.map((e) => `${e.created_at.slice(0, 10)} unclear · heard: “${e.transcript_en ?? "—"}”`));
        return apply(backToMenu(s, [summary, ...(flagged.length ? [t(s.lang, "unconfirmed", { n: flagged.length })] : [])]));
      }
      case "inbox": {
        const res = await api.inbox(s.number, s.pin, s.lang);
        if (!live()) return;
        if (!res.ok) return apply(backToMenu(s, [failure(res, s)]));
        const msgs = res.data.messages;
        if (msgs.length === 0) return apply(backToMenu(s, [t(s.lang, "no_messages")]));
        const said = msgs.map((m) =>
          m.text === null ? t(s.lang, "message_unclear") : `${t(s.lang, m.type === "doctor_prescription" ? "prescription" : "diagnosis")} ${m.text}`,
        );
        return apply(backToMenu(s, said));
      }
      case "send_audio": {
        const audio = pendingAudio.current!;
        pendingAudio.current = null; // drop our reference to the clip as soon as it is sent
        const res = effect.kind === "symptom"
          ? await api.ingest(s.number, s.pin, s.lang, audio)
          : await api.logInstruction(s.number, s.pin, s.lang, effect.kind, audio);
        if (!live()) return;
        if (!res.ok) return apply(backToMenu(s, [failure(res, s)]));
        return apply(backToMenu(s, [t(s.lang, res.data.event.content.needs_review ? "saved_unclear" : "saved")]));
      }
    }
  }

  function onKey(key: string) {
    const s = stateRef.current;
    if (s.step === "idle" || s.step === "working") return;
    if (s.step !== "number" && s.step !== "pin") addLines("key", [key]);
    apply(press(s, key));
  }

  function onAudio(audio: PickedAudio) {
    pendingAudio.current = audio.payload;
    addLines("key", [`🎤 ${audio.label}`]);
    apply(audioCaptured(stateRef.current));
  }

  function call() {
    callId.current++;
    setLines([]);
    apply(startCall());
  }

  function hangUp() {
    callId.current++;
    pendingAudio.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    stateRef.current = initialState;
    setState(initialState);
    setLines([]);
  }

  // Physical keyboard works as the keypad too (Enter = #).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
      const key = e.key === "Enter" ? "#" : e.key;
      if (KEYS.includes(key)) onKey(key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const inCall = state.step !== "idle";
  const entry = state.step === "pin" ? "•".repeat(state.digits.length) : state.step === "number" ? state.digits : "";

  return (
    <div className="flex w-[260px] flex-col items-center gap-3 rounded-[2rem] border-4 border-slate-700 bg-slate-800 p-4 shadow-xl">
      <div className="text-[10px] uppercase tracking-widest text-slate-400">basic phone</div>

      <div className="flex h-[260px] w-full flex-col rounded-md bg-lime-100 font-mono text-[11px] leading-snug text-slate-900 shadow-inner">
        <div className="flex justify-between border-b border-lime-300 px-2 py-1 text-[10px] text-slate-600">
          <span>{inCall ? `☎ In call · ${state.lang === "sw" ? "Kiswahili" : "English"}` : "Ready"}</span>
          <button onClick={() => setSpeaker(!speaker)} title="Read prompts aloud (browser voice)">{speaker ? "🔊" : "🔈"}</button>
        </div>
        <div ref={screenRef} className="flex-1 space-y-1 overflow-y-auto px-2 py-1">
          {!inCall && <div className="pt-16 text-center text-slate-500">Press the green button to call</div>}
          {lines.map((l) => (
            <div key={l.id} className={l.kind === "key" ? "text-right text-slate-500" : l.kind === "note" ? "text-[10px] italic text-amber-800" : ""}>
              {l.kind === "voice" ? `🔊 ${l.text}` : l.text}
            </div>
          ))}
          {state.step === "working" && <div className="text-slate-500">…</div>}
        </div>
        {(state.step === "number" || state.step === "pin") && (
          <div className="border-t border-lime-300 px-2 py-1 text-base tracking-widest">{entry || " "}</div>
        )}
      </div>

      {state.step === "record" && (
        <div className="w-full rounded-md bg-slate-700 p-2">
          <AudioPicker onReady={onAudio} />
        </div>
      )}

      <div className="flex w-full justify-between">
        <button onClick={call} disabled={inCall} className="h-10 w-20 rounded-full bg-green-600 text-lg text-white disabled:opacity-40" aria-label="Call">
          📞
        </button>
        <button onClick={hangUp} disabled={!inCall} className="h-10 w-20 rounded-full bg-red-600 text-lg text-white disabled:opacity-40" aria-label="Hang up">
          ⏻
        </button>
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button key={k} onClick={() => onKey(k)} className="h-11 rounded-lg bg-slate-600 text-lg font-semibold text-white active:bg-slate-500">
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
