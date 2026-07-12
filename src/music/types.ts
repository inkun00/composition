import type { Rational } from "./rational";

// These are child-facing "melody personalities", not music-theory terms.
// Keeping them separate lets the same chord symbol lead to noticeably different
// contour, register and rhythm choices.
export type HarmonyStory =
  | "home"
  | "journey"
  | "wonder"
  | "bounce"
  | "tender"
  | "brave"
  | "shadow"
  | "sparkle"
  | "swing"
  | "floating"
  | "march"
  | "folk";

export type NoteEvent = Readonly<{
  id: string;
  pitch: number | null;
  duration: Rational;
  dotted?: boolean;
  beamGroup?: string;
  beamBreak?: boolean;
  linkToNext?: boolean;
  restY?: number;
  lyric?: string;
}>;

export type SoundEffectEvent = Readonly<{
  id: string;
  effectId: string;
  offsetBeats: number;
}>;

export type MelodyCandidate = Readonly<{
  id: string;
  name: string;
  hint: string;
  feelingId?: string;
  harmony: HarmonyStory;
  notes: readonly NoteEvent[];
}>;

export type MeasureValidation =
  | { state: "exact"; difference: Rational; message: string }
  | { state: "short"; difference: Rational; message: string }
  | { state: "over"; difference: Rational; message: string };
