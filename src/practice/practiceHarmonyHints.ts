import { staffDegreeForPitch } from "../music/accidental";
import { chordPitchClasses } from "../music/chord";
import { measureCapacity, type Meter } from "../music/meter";
import { toNumber } from "../music/rational";
import { pitchName, positionNotes } from "../music/score";
import type { NoteEvent } from "../music/types";
import type { PracticeMeasure } from "./practiceModel";
import { PRACTICE_MAX_PITCH, PRACTICE_MIN_PITCH, PRACTICE_PITCHES } from "./practicePitch";

export type PracticeHarmonyHint = Readonly<{
  noteId: string;
  kind: "non-chord" | "ending" | "leap";
  message: string;
  suggestedPitches: readonly number[];
}>;

export type PracticeHarmonyContext = Readonly<{
  previousMeasure?: PracticeMeasure;
  nextMeasure?: PracticeMeasure;
  isFinalMeasure?: boolean;
}>;

type ContextNote = Readonly<{ note: NoteEvent; chord: string }>;

function isChordTone({ note, chord }: ContextNote): boolean {
  return note.pitch !== null && chordPitchClasses(chord).includes(((note.pitch % 12) + 12) % 12);
}

function isStep(before: NoteEvent, after: NoteEvent): boolean {
  if (before.pitch === null || after.pitch === null) return false;
  const semitones = Math.abs(after.pitch - before.pitch);
  const degrees = Math.abs(staffDegreeForPitch(after.pitch, after.accidental) - staffDegreeForPitch(before.pitch, before.accidental));
  return semitones > 0 && semitones <= 2 && (degrees === 1 || (degrees === 0 && semitones === 1));
}

function isStrongBeat(onset: number, meter: Meter): boolean {
  if (onset === 0) return true;
  if (meter.beatUnit === 8 && meter.beats % 3 === 0) return onset % 1.5 === 0;
  return meter.beats === 4 && meter.beatUnit === 4 && onset === 2;
}

function measureIsFull(notes: readonly NoteEvent[], meter: Meter): boolean {
  return notes.reduce((sum, note) => sum + toNumber(note.duration), 0) === toNumber(measureCapacity(meter));
}

function surroundingNotes(notes: readonly NoteEvent[], chord: string, meter: Meter, options: PracticeHarmonyContext) {
  const previous = options.previousMeasure && measureIsFull(options.previousMeasure.notes, meter)
    ? options.previousMeasure.notes.map((note) => ({ note, chord: options.previousMeasure!.chord })) : [];
  const next = options.nextMeasure && measureIsFull(notes, meter)
    ? options.nextMeasure.notes.map((note) => ({ note, chord: options.nextMeasure!.chord })) : [];
  return { events: [...previous, ...notes.map((note) => ({ note, chord })), ...next], offset: previous.length };
}

// These are conservative melodic patterns, not a judgement of musical quality.
// Stable endpoints and harmonic changes matter; no fixed eighth-note limit.
// https://musictheory.pugetsound.edu/mt21c/PassingTones.html
// https://viva.pressbooks.pub/openmusictheorycopy/chapter/embellishing-tones-old/
function hasPassingConnection(events: readonly ContextNote[], index: number): boolean {
  let left = index - 1;
  let right = index + 1;
  while (left >= 0 && events[left].note.pitch !== null && !isChordTone(events[left])) left -= 1;
  while (right < events.length && events[right].note.pitch !== null && !isChordTone(events[right])) right += 1;
  if (left < 0 || right >= events.length || !isChordTone(events[left]) || !isChordTone(events[right])) return false;
  const direction = Math.sign(events[right].note.pitch! - events[left].note.pitch!);
  if (direction === 0) return false;
  for (let cursor = left + 1; cursor <= right; cursor += 1) {
    const before = events[cursor - 1].note;
    const after = events[cursor].note;
    if (!isStep(before, after) || Math.sign(after.pitch! - before.pitch!) !== direction) return false;
  }
  return true;
}

function hasResolvedContext(events: readonly ContextNote[], index: number, strongBeat: boolean): boolean {
  const current = events[index].note;
  const before = events[index - 1];
  const after = events[index + 1];
  if (!before || !after || current.pitch === null || !isChordTone(before) || !isChordTone(after)) return false;
  if (hasPassingConnection(events, index)) return true;
  const incoming = current.pitch - before.note.pitch!;
  const outgoing = after.note.pitch! - current.pitch;
  if (isStep(before.note, current) && isStep(current, after.note) && before.note.pitch === after.note.pitch) return true;
  // Prepared notes can resolve down (suspension) or up (retardation).
  if (incoming === 0 && isStep(current, after.note)) return true;
  // Accented appoggiaturas / unaccented incomplete neighbours, and escape tones.
  if (Math.abs(incoming) > 2 && isStep(current, after.note) && Math.sign(incoming) !== Math.sign(outgoing)) return true;
  return !strongBeat && isStep(before.note, current) && Math.abs(outgoing) > 2 && Math.sign(incoming) !== Math.sign(outgoing);
}

function isAnticipation(notes: readonly NoteEvent[], index: number, onset: number, meter: Meter, options: PracticeHarmonyContext): boolean {
  const note = notes[index];
  const before = notes[index - 1];
  const after = options.nextMeasure?.notes[0];
  return index === notes.length - 1 && measureIsFull(notes, meter) && !isStrongBeat(onset, meter) &&
    note.pitch !== null && Boolean(before && isStep(before, note)) && Boolean(after &&
      after.pitch === note.pitch && isChordTone({ note: after, chord: options.nextMeasure!.chord }));
}

function resolvedNoteIds(notes: readonly NoteEvent[], chord: string, meter: Meter, options: PracticeHarmonyContext): Set<string> {
  const { events, offset } = surroundingNotes(notes, chord, meter, options);
  const resolved = new Set<string>();
  positionNotes(notes).forEach((note, index) => {
    if (note.pitch === null || isChordTone({ note, chord })) return;
    const eventIndex = offset + index;
    if (hasPassingConnection(events, eventIndex) ||
      hasResolvedContext(events, eventIndex, isStrongBeat(note.onset, meter)) ||
      isAnticipation(notes, index, note.onset, meter, options)) resolved.add(note.id);
  });
  return resolved;
}

function suggestedChordPitches(pitch: number, chord: string): number[] {
  const allowed = chordPitchClasses(chord);
  return Array.from({ length: PRACTICE_MAX_PITCH - PRACTICE_MIN_PITCH + 1 }, (_, index) => PRACTICE_MIN_PITCH + index)
    .filter((candidate) => allowed.includes(candidate % 12))
    .sort((left, right) => Math.abs(left - pitch) - Math.abs(right - pitch) || left - right)
    .slice(0, 3);
}

function suggestedStepPitches(previous: number, current: number, chord: string): number[] {
  const direction = Math.sign(current - previous);
  const allowed = chordPitchClasses(chord);
  const cost = (pitch: number) => Math.abs(pitch - previous) +
    (Math.sign(pitch - previous) === direction ? 0 : 4) + (allowed.includes(pitch % 12) ? 0 : 1);
  return PRACTICE_PITCHES.map((option) => option.pitch)
    .filter((pitch) => pitch !== previous && Math.abs(pitch - previous) <= 4)
    .sort((left, right) => cost(left) - cost(right) || left - right).slice(0, 3);
}

export function getPracticeHarmonyHints(
  notes: readonly NoteEvent[], chord: string, meter: Meter, options: PracticeHarmonyContext = {}
): readonly PracticeHarmonyHint[] {
  const resolved = resolvedNoteIds(notes, chord, meter, options);
  const positioned = positionNotes(notes);
  const capacity = toNumber(measureCapacity(meter));
  const finalMeasure = options.isFinalMeasure ?? !options.nextMeasure;
  return positioned.flatMap((note, index): PracticeHarmonyHint[] => {
    if (note.pitch === null) return [];
    const reasons: string[] = [];
    let kind: PracticeHarmonyHint["kind"] = "leap";
    let suggestedPitches: number[] = [];
    const label = `${index + 1}번째 ${pitchName(note.pitch, note.accidental)}`;
    if (!isChordTone({ note, chord }) && !resolved.has(note.id)) {
      const ending = finalMeasure && index === notes.length - 1 && note.onset + toNumber(note.duration) === capacity;
      kind = ending ? "ending" : "non-chord";
      reasons.push(`${label}는 ${chord} 화음의 구성음이 아니에요. 의도한 색채음일 수 있어요.`);
      if (ending) reasons.push("곡의 끝에서 편안하게 마치고 싶다면 가까운 화음 음으로 바꿔 들어 보세요. 어떤 끝맺음이 좋은지는 전체 흐름에 따라 달라요.");
      else if (isStrongBeat(note.onset, meter)) reasons.push("힘주는 박에 놓여 있어요. 가까운 화음 음으로 이어지는지 앞뒤 음을 함께 들어 보세요.");
      else reasons.push("앞뒤 화음 음으로 이어지는지 들어 보세요. 가까운 음으로 옮겼을 때의 느낌도 비교해 볼까요?");
      suggestedPitches = suggestedChordPitches(note.pitch, chord);
    }
    const previous = positioned[index - 1];
    if (previous?.pitch !== undefined && previous.pitch !== null && Math.abs(note.pitch - previous.pitch) > 7) {
      reasons.push(`${label}는 앞 음에서 크게 뛰어요. 부르기 편하게 만들고 싶다면 가까운 음으로 한 걸음씩 움직여 듣고 비교해 보세요.`);
      if (suggestedPitches.length === 0) suggestedPitches = suggestedStepPitches(previous.pitch, note.pitch, chord);
    }
    return reasons.length > 0 ? [{ noteId: note.id, kind, message: reasons.join(" "), suggestedPitches }] : [];
  });
}

export function getPracticeHarmonySummary(
  notes: readonly NoteEvent[], chord: string, meter: Meter, options: PracticeHarmonyContext = {}
): string {
  const sounding = notes.filter((note) => note.pitch !== null);
  if (sounding.length === 0) return "소리가 나는 음표를 넣은 뒤 화음과 가락을 함께 살펴봐요.";
  const nonChord = sounding.filter((note) => !isChordTone({ note, chord }));
  if (nonChord.length === 0) {
    const colour = /7|dim|sus|°/.test(chord) ? " 긴장이나 색채가 있는 화음이므로 다음 화음과의 연결도 들어 보세요." : "";
    return `선택한 ${chord} 화음의 구성음으로 가락을 만들었어요.${colour} 실제 느낌은 앞뒤 마디와 함께 들어 보세요.`;
  }
  const resolved = resolvedNoteIds(notes, chord, meter, options);
  return nonChord.every((note) => resolved.has(note.id))
    ? "화음에 없는 음도 앞뒤 화음 음으로 이어지는 흐름이 있어요. 꾸밈음이나 화음 사이를 잇는 움직임으로 사용할 수 있어요. 실제 느낌은 함께 들어 보세요."
    : `선택한 ${chord} 화음에 없는 음도 있어요. 의도한 색채음일 수 있으니 앞뒤 음과 다음 마디를 함께 들어 보세요.`;
}
