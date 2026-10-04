// Pre-recorded demo clips served from /public/clips. Add real Swahili recordings here.
export interface Clip {
  label: string;
  url: string;
}

export const CLIPS: Clip[] = [
  // { label: "Kichwa kinauma siku tatu (headache, 3 days)", url: "/clips/headache.webm" },
  { label: "Near-silent clip (shows the fail-safe)", url: "/clips/silence.wav" },
];
