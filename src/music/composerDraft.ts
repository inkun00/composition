import type { SavedDraft } from "./draft";
import type { HarmonyPreset } from "./harmonyPresets";
import type { SongLength } from "./songLength";
import type { SharedComposition } from "./share";
import type { HarmonyStory, NoteEvent, SoundEffectEvent } from "./types";

export type MeasureDraft = {
  story: HarmonyStory;
  storyHint: string;
  chords: readonly string[];
  candidateId: string | null;
  candidateName: string | null;
  notes: readonly NoteEvent[] | null;
  effects: readonly SoundEffectEvent[];
  keyFifths?: number;
};

const roleHints: Record<HarmonyStory, readonly string[]> = {
  home: ["편안하게 시작", "잠깐 쉬어 가기", "우리 집에 도착"],
  journey: ["한 걸음 출발", "조금 더 멀리", "힘차게 나아가기"],
  wonder: ["다음이 궁금하게", "비밀 문 앞에서", "마지막을 기다려"],
  bounce: ["통통 뛰어가기", "리듬을 타기", "즐겁게 도착"],
  tender: ["살며시 시작", "따뜻하게 이어가기", "포근히 마무리"],
  brave: ["가슴 펴고 시작", "더 높이 나아가기", "당당하게 도착"],
  shadow: ["조심조심 시작", "비밀 길 지나기", "살짝 풀어주기"],
  sparkle: ["반짝이며 시작", "별빛 따라가기", "빛나게 도착"],
  swing: ["몸을 흔들며", "리듬에 맞추기", "들썩이며 끝내기"],
  floating: ["구름에 올라", "둥실둥실 걷기", "살며시 내려오기"],
  march: ["발맞춰 출발", "씩씩하게 걷기", "힘차게 도착"],
  folk: ["이야기 시작", "노래를 이어가기", "함께 마무리"]
};

export function emptyComposition(preset: HarmonyPreset, length: SongLength): MeasureDraft[] {
  return Array.from({ length }, (_, index) => {
    const story = preset.roles[index % preset.roles.length];
    return {
      story,
      storyHint: roleHints[story][Math.floor(index / 4) % roleHints[story].length],
      chords: preset.bars[index % preset.bars.length],
      candidateId: null,
      candidateName: null,
      notes: null,
      effects: []
    };
  });
}

export function lyricText(notes: readonly NoteEvent[] | null): string {
  return (notes ?? []).filter((note) => note.pitch !== null).map((note) => note.lyric ?? "").join("");
}

function applyLegacyLyric(notes: readonly NoteEvent[], lyric: string | undefined): readonly NoteEvent[] {
  if (!lyric || notes.some((note) => note.lyric)) return notes;
  const syllables = Array.from(lyric.replace(/\s+/g, ""));
  let lyricIndex = 0;
  return notes.map((note) => note.pitch === null ? note : { ...note, lyric: syllables[lyricIndex++] ?? "" });
}

export function compositionFromShare(shared: SharedComposition, preset: HarmonyPreset): MeasureDraft[] {
  return emptyComposition(preset, shared.songLength).map((measure, index) => ({
    ...measure,
    chords: shared.measures[index].chords ?? measure.chords,
    keyFifths: shared.measures[index].keyFifths,
    candidateId: "shared",
    candidateName: shared.measures[index].candidateName,
    notes: applyLegacyLyric(shared.measures[index].notes, shared.lyrics[index]),
    effects: shared.measures[index].effects ?? []
  }));
}

export function compositionFromDraft(draft: SavedDraft, preset: HarmonyPreset): MeasureDraft[] {
  return emptyComposition(preset, draft.songLength).map((measure, index) => ({
    ...measure,
    chords: draft.measures[index].chords ?? measure.chords,
    keyFifths: draft.measures[index].keyFifths,
    candidateId: draft.measures[index].candidateId,
    candidateName: draft.measures[index].candidateName,
    notes: draft.measures[index].notes
      ? applyLegacyLyric(draft.measures[index].notes, draft.lyrics[index]) : null,
    effects: draft.measures[index].effects ?? []
  }));
}

export function resizeComposition(
  measures: readonly MeasureDraft[], preset: HarmonyPreset, length: SongLength
): MeasureDraft[] {
  return emptyComposition(preset, length).map((empty, index) => measures[index] ?? empty);
}

export function changeCompositionHarmony(
  measures: readonly MeasureDraft[], preset: HarmonyPreset
): MeasureDraft[] {
  return emptyComposition(preset, measures.length).map((harmony, index) => ({
    ...measures[index],
    story: harmony.story,
    storyHint: harmony.storyHint,
    chords: harmony.chords
  }));
}

export function shortenedMeasuresContainWork(measures: readonly MeasureDraft[], length: number): boolean {
  return measures.slice(length).some((measure) => Boolean(measure.notes?.length || measure.effects.length));
}
