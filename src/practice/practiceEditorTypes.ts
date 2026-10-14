import type { Meter } from "../music/meter";
import type { NoteEvent } from "../music/types";

export type PracticeEditorsProps = {
  notes: readonly NoteEvent[];
  meter: Meter;
  step: "rhythm" | "melody";
  inputMode: "grid" | "score";
  selectedNoteId: string | null;
  playingNoteId?: string | null;
  disabled?: boolean;
  showTools?: boolean;
  showSummary?: boolean;
  compact?: boolean;
  appendDuration?: number;
  appendRest?: boolean;
  onAppendDurationChange?: (beats: number) => void;
  onAppendRestChange?: (rest: boolean) => void;
  onNoteLyric?: (id: string, lyric: string) => void;
  onSelectNote: (id: string) => void;
  onPitch: (id: string, pitch: number) => void;
  onDuration: (id: string, beats: number, dotted?: boolean) => void;
  onDelete: (id: string) => void;
  onAdd: (beats: number, pitch: number | null, dotted?: boolean) => void;
};
