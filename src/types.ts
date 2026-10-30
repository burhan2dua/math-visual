import type { ComponentType } from "react";

export type CueVoice =
  | "bell"
  | "pop"
  | "pluck"
  | "sparkle"
  | "whoosh"
  | "thud"
  | "chime";

export type Cue = {
  id: string;
  beat: number;
  voice: CueVoice;
  notes?: number[]; // MIDI, boleh banyak nada sekaligus (polyphonic)
  gain?: number;
  pan?: number; // -1 .. 1
};

export type Pad = {
  beat: number;
  beats: number;
  root: number;
  notes: number[];
  gain?: number;
  subGain?: number;
  attackSeconds?: number;
  releaseSeconds?: number;
  pan?: number;
};

export type SoundSettings = {
  sampleRate?: 22050 | 32000 | 44100 | 48000 | 96000;
  masterGain?: number;
  clipDrive?: number;
  fadeOutSeconds?: number;
  tick?: {
    enabled?: boolean;
    gain?: number;
    subdivisionBeats?: number;
    pan?: number;
  };
  reverb?: {
    mix?: number;
    feedback?: number;
    damping?: number;
    delaysMs?: number[];
  };
};

export type Caption = {
  from: number;
  to: number;
  title: string;
  sub?: string;
};

export type SfxEvent = {
  t: number;
  type:
    | "riser"
    | "hit"
    | "pluck"
    | "burst"
    | "drop"
    | "cut"
    | "arp"
    | "swell";
  tag?: string;
  note?: string;
  notes?: string[];
  len?: number;
  vel?: number;
  pan?: number;
  step?: number;
};

export type TemplateData = {
  title: string;
  subtitle: string;
  background: string;
  accent: string;
  durationInSeconds: number;
  // opsional (default 1920x1080 @ 30fps)
  width?: number;
  height?: number;
  fps?: number;
  // opsional: timeline musik
  bpm?: number;
  audio?: string; // path relatif ke /public
  sound?: SoundSettings;
  audioSrc?: string;
  tickGain?: number;
  cues?: Cue[];
  pads?: Pad[];
  events?: SfxEvent[];
  captions?: Caption[];
};

export type TemplateDefinition = {
  id: string;
  name: string;
  description: string;
  component: ComponentType<{ data: TemplateData }>;
  data: TemplateData;
};