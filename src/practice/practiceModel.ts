import { measureCapacity, type Meter } from "../music/meter";
import { rational, sum, toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";

export { PRACTICE_PITCHES } from "./practicePitch";
export { getPracticeHarmonyHints, type PracticeHarmonyHint } from "./practiceHarmonyHints";

export type PracticeMeasure = {
  id: string;
  notes: readonly NoteEvent[];
  lyric: string;
  chord: string;
};

// beats always includes the dot: a dotted quarter lasts 1.5 quarter-note beats.
export const PRACTICE_DURATIONS: readonly {
  beats: number;
  label: string;
  symbol: string;
  dotted?: boolean;
}[] = [
  { beats: 0.25, label: "16분음표 · 1/4박", symbol: "𝅘𝅥𝅯" },
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
  const allowed = PRACTICE_DURATIONS.map((duration) => duration.beats * 4);
  const average = totalSlots / syllableCount;
  const memo = new Map<string, { slots: number[]; cost: number } | null>();

  function choose(remaining: number, count: number): { slots: number[]; cost: number } | null {
    if (count === 0) return remaining === 0 ? { slots: [], cost: 0 } : null;
    if (remaining < count || remaining > count * 16) return null;
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
  const totalSlots = toNumber(capacity) * 4;
  if (!Number.isSafeInteger(totalSlots) || totalSlots < 1) {
    throw new Error("이 박자는 1/4박 칸으로 만들 수 없어요. 다른 박자를 골라 주세요.");
  }
  if (syllables.length > totalSlots) {
    throw new Error(`가사 ${syllables.length}글자는 이 마디에 모두 들어가지 않아요. 16분음표로 최대 ${totalSlots}글자를 넣을 수 있어요. 가사를 다음 마디에 나눠 적어 주세요.`);
  }
  const slots = draftRhythmSlots(totalSlots, syllables.length);
  if (!slots) {
    throw new Error("이 가사와 박자는 한 음표씩 맞추기 어려워요. 가사를 더 넣거나 마디를 나눠 주세요.");
  }
  return syllables.map((syllable, index) => {
    const beats = slots[index] / 4;
    return {
      id: `${idPrefix}-${index + 1}`,
      pitch: 60,
      duration: rational(slots[index], 4),
      ...(beats === 1.5 || beats === 3 ? { dotted: true } : {}),
      lyric: syllable
    };
  });
}


export function practiceDurationSeconds(measures: readonly PracticeMeasure[], bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error("빠르기를 0보다 큰 숫자로 골라 주세요.");
  }
  const beats = sum(measures.flatMap((measure) => measure.notes.map((note) => note.duration)));
  return toNumber(beats) * 60 / bpm;
}
