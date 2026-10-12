import { chordPitchClasses } from "../music/chord";
import { measureCapacity, type Meter } from "../music/meter";
import { add, compare, rational, sum, toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";

export type PracticeMeasure = {
  id: string;
  notes: readonly NoteEvent[];
  lyric: string;
  chord: string;
};

export const PRACTICE_PITCHES: readonly {
  pitch: number;
  label: string;
  color: string;
}[] = [
  { pitch: 60, label: "낮은 도", color: "#e45158" },
  { pitch: 62, label: "레", color: "#ed922f" },
  { pitch: 64, label: "미", color: "#d7ad19" },
  { pitch: 65, label: "파", color: "#79a94e" },
  { pitch: 67, label: "솔", color: "#419ebd" },
  { pitch: 69, label: "라", color: "#657bc9" },
  { pitch: 71, label: "시", color: "#a177b3" },
  { pitch: 72, label: "높은 도", color: "#d96d95" }
];

// beats always includes the dot: a dotted quarter lasts 1.5 quarter-note beats.
export const PRACTICE_DURATIONS: readonly {
  beats: number;
  label: string;
  symbol: string;
  dotted?: boolean;
}[] = [
  { beats: 0.5, label: "8분음표 · 반 박", symbol: "♪" },
  { beats: 1, label: "4분음표 · 1박", symbol: "♩" },
  { beats: 1.5, label: "점4분음표 · 1박 반", symbol: "♩·", dotted: true },
  { beats: 2, label: "2분음표 · 2박", symbol: "𝅗𝅥" },
  { beats: 3, label: "점2분음표 · 3박", symbol: "𝅗𝅥·", dotted: true },
  { beats: 4, label: "온음표 · 4박", symbol: "𝅝" }
];

export function createPracticeMeasures(count: number): PracticeMeasure[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error("연습할 마디 수를 1 이상의 정수로 골라 주세요.");
  }
  return Array.from({ length: count }, (_, index) => ({
    id: `practice-measure-${index + 1}`,
    notes: [],
    lyric: "",
    chord: "C"
  }));
}

export function lyricSyllables(lyric: string): string[] {
  const syllables: string[] = [];
  for (const character of lyric.normalize("NFC")) {
    if (/[\p{L}\p{N}]/u.test(character)) syllables.push(character);
    else if (/\p{M}/u.test(character) && syllables.length > 0) {
      syllables[syllables.length - 1] += character;
    }
  }
  return syllables;
}

export function assignPracticeLyrics(notes: readonly NoteEvent[], lyric: string): NoteEvent[] {
  const syllables = lyricSyllables(lyric);
  let syllableIndex = 0;
  return notes.map((note) => {
    const { lyric: previousLyric, ...withoutLyric } = note;
    void previousLyric;
    if (note.pitch === null) return withoutLyric;
    return { ...withoutLyric, lyric: syllables[syllableIndex++] ?? "" };
  });
}

function draftRhythmSlots(totalSlots: number, syllableCount: number): number[] | null {
  const allowed = PRACTICE_DURATIONS.map((duration) => duration.beats * 2);
  const average = totalSlots / syllableCount;
  const memo = new Map<string, { slots: number[]; cost: number } | null>();

  function choose(remaining: number, count: number): { slots: number[]; cost: number } | null {
    if (count === 0) return remaining === 0 ? { slots: [], cost: 0 } : null;
    if (remaining < count || remaining > count * 8) return null;
    const key = `${remaining}:${count}`;
    if (memo.has(key)) return memo.get(key) ?? null;
    let best: { slots: number[]; cost: number } | null = null;
    for (const slots of allowed) {
      const next = choose(remaining - slots, count - 1);
      if (!next) continue;
      // Prefer even syllable lengths; a slightly longer ending is easy to sing.
      const cost = next.cost + (slots - average) ** 2 + slots * count * 0.01;
      if (!best || cost < best.cost) best = { slots: [slots, ...next.slots], cost };
    }
    memo.set(key, best);
    return best;
  }

  return choose(totalSlots, syllableCount)?.slots ?? null;
}

export function makeLyricRhythm(lyric: string, meter: Meter, idPrefix: string): NoteEvent[] {
  const syllables = lyricSyllables(lyric);
  if (syllables.length === 0) {
    throw new Error("가사를 먼저 적어 주세요. 글자마다 리듬 음표를 만들어 드려요.");
  }
  const capacity = measureCapacity(meter);
  const totalSlots = toNumber(capacity) * 2;
  if (!Number.isSafeInteger(totalSlots) || totalSlots < 1) {
    throw new Error("이 박자는 반 박 칸으로 만들 수 없어요. 다른 박자를 골라 주세요.");
  }
  if (syllables.length > totalSlots) {
    throw new Error(`가사 ${syllables.length}글자는 이 마디에 모두 들어가지 않아요. 반 박 음표로 최대 ${totalSlots}글자를 넣을 수 있어요. 가사를 다음 마디에 나눠 적어 주세요.`);
  }
  const slots = draftRhythmSlots(totalSlots, syllables.length);
  if (!slots) {
    throw new Error("이 가사와 박자는 한 음표씩 맞추기 어려워요. 가사를 더 넣거나 마디를 나눠 주세요.");
  }
  return syllables.map((syllable, index) => {
    const beats = slots[index] / 2;
    return {
      id: `${idPrefix}-${index + 1}`,
      pitch: 60,
      duration: rational(slots[index], 2),
      ...(beats === 1.5 || beats === 3 ? { dotted: true } : {}),
      lyric: syllable
    };
  });
}

export type PracticeHarmonyHint = Readonly<{
  noteId: string;
  message: string;
  suggestedPitches: readonly number[];
}>;

function pitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

function isStrongBeat(onset: number, meter: Meter): boolean {
  if (onset === 0) return true;
  if (meter.beatUnit === 8 && meter.beats % 3 === 0) {
    return onset % 1.5 === 0;
  }
  return meter.beats === 4 && meter.beatUnit === 4 && onset === 2;
}

function isGentlePassingTone(notes: readonly NoteEvent[], index: number): boolean {
  const before = notes[index - 1];
  const current = notes[index];
  const after = notes[index + 1];
  if (!before || !after || before.pitch === null || current.pitch === null || after.pitch === null) {
    return false;
  }
  if (toNumber(current.duration) > 0.5) return false;
  const incoming = current.pitch - before.pitch;
  const outgoing = after.pitch - current.pitch;
  if (incoming === 0 || outgoing === 0 || Math.abs(incoming) > 2 || Math.abs(outgoing) > 2) {
    return false;
  }
  return Math.sign(incoming) === Math.sign(outgoing) || before.pitch === after.pitch;
}

function suggestedChordPitches(pitch: number, chord: string): number[] {
  const chordClasses = chordPitchClasses(chord);
  return PRACTICE_PITCHES.map((option) => option.pitch)
    .filter((candidate) => chordClasses.includes(pitchClass(candidate)))
    .sort((left, right) => Math.abs(left - pitch) - Math.abs(right - pitch) || left - right)
    .slice(0, 3);
}

function suggestedStepPitches(previous: number, current: number, chord: string): number[] {
  const direction = Math.sign(current - previous);
  const chordClasses = chordPitchClasses(chord);
  return PRACTICE_PITCHES.map((option) => option.pitch)
    .filter((pitch) => pitch !== previous && Math.abs(pitch - previous) <= 4)
    .sort((left, right) => {
      const cost = (pitch: number) => Math.abs(pitch - previous) +
        (Math.sign(pitch - previous) === direction ? 0 : 4) +
        (chordClasses.includes(pitchClass(pitch)) ? 0 : 1);
      return cost(left) - cost(right) || left - right;
    })
    .slice(0, 3);
}

export function getPracticeHarmonyHints(
  notes: readonly NoteEvent[],
  chord: string,
  meter: Meter
): readonly PracticeHarmonyHint[] {
  const hints: PracticeHarmonyHint[] = [];
  const chordClasses = chordPitchClasses(chord);
  const capacity = measureCapacity(meter);
  let onset = rational(0);
  notes.forEach((note, index) => {
    const end = add(onset, note.duration);
    if (note.pitch !== null) {
      const reasons: string[] = [];
      let suggestedPitches: number[] = [];
      const isChordTone = chordClasses.includes(pitchClass(note.pitch));
      if (!isChordTone && isStrongBeat(toNumber(onset), meter) && !isGentlePassingTone(notes, index)) {
        reasons.push("힘주는 박에서 화음과 살짝 부딪히는 소리가 나요. 가까운 음으로 한 칸 옮겨 듣고 어떤 느낌인지 비교해 볼까요?");
        suggestedPitches = suggestedChordPitches(note.pitch, chord);
      }
      if (!isChordTone && index === notes.length - 1 && compare(end, capacity) === 0 &&
        toNumber(note.duration) >= 1) {
        reasons.push("마지막 음이 다음으로 이어지고 싶은 느낌이에요. 편안하게 마치고 싶다면 화음에 있는 가까운 음을 찾아 들어 보세요.");
        suggestedPitches = suggestedChordPitches(note.pitch, chord);
      }
      const previous = notes[index - 1];
      if (previous?.pitch !== null && previous?.pitch !== undefined &&
        Math.abs(note.pitch - previous.pitch) > 7) {
        reasons.push("음이 멀리 뛰어서 부르기 어려울 수 있어요. 사이에 있는 가까운 음을 골라 한 걸음씩 움직여 볼까요?");
        if (suggestedPitches.length === 0) suggestedPitches = suggestedStepPitches(previous.pitch, note.pitch, chord);
      }
      if (reasons.length > 0) {
        hints.push({ noteId: note.id, message: reasons.join(" "), suggestedPitches });
      }
    }
    onset = end;
  });
  return hints;
}

export function practiceDurationSeconds(measures: readonly PracticeMeasure[], bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error("빠르기를 0보다 큰 숫자로 골라 주세요.");
  }
  const beats = sum(measures.flatMap((measure) => measure.notes.map((note) => note.duration)));
  return toNumber(beats) * 60 / bpm;
}
