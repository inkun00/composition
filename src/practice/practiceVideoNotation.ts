import { displayedAccidentalSymbol, midiToVexKey } from "../music/accidental";
import { toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";

export type PracticeVideoNotation = Readonly<{
  key: string;
  duration: string;
  dotted: boolean;
  accidental: "#" | "b" | "n" | null;
}>;

const durations = [
  { beats: 4, code: "w" },
  { beats: 2, code: "h" },
  { beats: 1, code: "q" },
  { beats: 0.5, code: "8" },
  { beats: 0.25, code: "16" },
  { beats: 0.125, code: "32" }
] as const;

/** Dot lengths are already included in the authored rational duration. */
export function practiceVideoNotation(note: NoteEvent): PracticeVideoNotation {
  const beats = toNumber(note.duration);
  const direct = durations.find((duration) => Math.abs(duration.beats - beats) < 0.000001);
  const dot = durations.find((duration) => Math.abs(duration.beats * 1.5 - beats) < 0.000001);
  const base = note.dotted ? dot : direct ?? dot;
  if (!base) throw new Error("영상에 표시할 음표 길이를 확인해 주세요.");
  const dotted = Boolean(note.dotted || !direct && dot);
  const symbol = note.pitch === null ? "" : note.accidental === "natural"
    ? "♮" : displayedAccidentalSymbol(note.pitch, note.accidental);
  return {
    key: note.pitch === null ? "b/4" : midiToVexKey(note.pitch, note.accidental),
    duration: base.code + (dotted ? "d" : "") + (note.pitch === null ? "r" : ""),
    dotted,
    accidental: symbol === "♯" ? "#" : symbol === "♭" ? "b" : symbol === "♮" ? "n" : null
  };
}
