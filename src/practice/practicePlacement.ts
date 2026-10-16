import { rational, toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { PRACTICE_DURATIONS } from "./practiceModel";

/** The sequential score represents silence before a clicked slot with visible rests. */
export function practicePlacementRests(notes: readonly NoteEvent[], onset: number | undefined, nextId: () => string): NoteEvent[] | null {
  const total = notes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  if (onset === undefined) return [];
  if (!Number.isFinite(onset) || onset < total || !Number.isInteger(onset * 4)) return null;
  let remaining = onset - total;
  const rests: NoteEvent[] = [];
  for (const duration of [...PRACTICE_DURATIONS].reverse()) {
    while (remaining >= duration.beats) {
      rests.push({ id: nextId(), pitch: null, duration: rational(duration.beats * 4, 4), dotted: duration.dotted });
      remaining -= duration.beats;
    }
  }
  return remaining === 0 ? rests : null;
}
