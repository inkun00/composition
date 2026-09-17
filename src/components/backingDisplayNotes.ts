import { toNumber } from "../music/rational";
import { rational } from "../music/rational";
import { chordMidiPitches } from "../music/chord";
import { measureCapacity, type Meter } from "../music/meter";
import { createAccompanimentPattern, type AccompanimentStyleId } from "../music/accompaniment";
import type { NoteEvent } from "../music/types";

export type BackingMeasureDraft = Readonly<{
  chords: readonly string[];
}>;

export function repeatFourMeasures<T>(items: readonly T[], fromEnd = false): T[] {
  if (items.length === 0) return [];
  const source = fromEnd ? items.slice(Math.max(0, items.length - 4)) : items.slice(0, 4);
  const repeated: T[] = [];
  for (let index = 0; index < 4; index += 1) repeated.push(source[index % source.length]);
  return repeated;
}

export function rationalFromBeats(value: number) {
  return rational(Math.max(1, Math.round(value * 24)), 24);
}

export function backingDisplayNotes(
  measure: BackingMeasureDraft,
  meter: Meter,
  styleId: AccompanimentStyleId,
  section: "intro" | "outro",
  displayIndex: number
): NoteEvent[] {
  const capacity = toNumber(measureCapacity(meter));
  const chordSymbols = measure.chords.length > 0 ? measure.chords : [""];
  const chordBeats = capacity / chordSymbols.length;
  let sequence = 0;
  const events = chordSymbols.flatMap((chord, chordIndex) => {
    const pitches = chord ? chordMidiPitches(chord) : chordMidiPitches("C");
    return createAccompanimentPattern(styleId, chordBeats, meter).map((event) => {
      const id = `${section}-${displayIndex}-${sequence}`;
      sequence += 1;
      const pitch = event.voice === "root"
        ? pitches[0] - 12
        : event.voice === "step"
          ? pitches[(event.step ?? 0) % pitches.length]
          : pitches[0];
      return {
        id,
        onset: chordIndex * chordBeats + event.offsetBeats,
        duration: event.durationBeats,
        pitch: Math.max(48, Math.min(76, pitch))
      };
    });
  }).sort((left, right) => left.onset - right.onset);

  const notes: NoteEvent[] = [];
  let cursor = 0;
  events.forEach((event) => {
    if (event.onset > cursor + 0.001) {
      notes.push({ id: `${event.id}-rest-before`, pitch: null, duration: rationalFromBeats(event.onset - cursor) });
    }
    notes.push({ id: event.id, pitch: event.pitch, duration: rationalFromBeats(event.duration) });
    cursor = Math.max(cursor, event.onset + event.duration);
  });
  if (cursor < capacity - 0.001) {
    notes.push({ id: `${section}-${displayIndex}-rest-end`, pitch: null, duration: rationalFromBeats(capacity - cursor) });
  }
  return notes;
}
