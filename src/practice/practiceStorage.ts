import { findInstrument } from "../music/instruments";
import { isBeatInstrumentId } from "../music/beatInstruments";
import { meterKey, SUPPORTED_METERS, type Meter } from "../music/meter";
import { rational, toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { assignPracticeLyrics, createPracticeMeasures, lyricSyllables, PRACTICE_DURATIONS, type PracticeMeasure } from "./practiceModel";
import { MAX_PRACTICE_SCORES, normalizePracticeRhythmInstrument, type PracticeRhythmLayer } from "./practiceScores";
import { isPracticePitch } from "./practicePitch";
import { normalizePracticeHarmony } from "./practiceHarmony";

export type { PracticeRhythmLayer } from "./practiceScores";

export const PRACTICE_STORAGE_KEY = "maeum-melody-practice-v1";

export type PracticeDraft = {
  version: 1;
  title: string;
  meter: Meter;
  measures: PracticeMeasure[];
  bpm: number;
  melodyInstrumentId: string;
  rhythmInstrumentId: string;
  rhythmLayers: PracticeRhythmLayer[];
};

export function emptyPracticeDraft(): PracticeDraft {
  return {
    version: 1,
    title: "나의 연습 가락",
    meter: { beats: 4, beatUnit: 4 },
    measures: createPracticeMeasures(2),
    bpm: 96,
    melodyInstrumentId: findInstrument("piano").id,
    rhythmInstrumentId: "beat:woodblock",
    rhythmLayers: []
  };
}

function restoreMeasures(saved: PracticeMeasure[], ids: Set<string>, idPrefix: string): PracticeMeasure[] {
  const restored = saved.map((measure, index) => {
    if (typeof measure.lyric !== "string" || !Array.isArray(measure.notes) || measure.notes.length > 64) throw new Error("Invalid measure");
    const lyric = measure.lyric.slice(0, 200);
    const hasSavedPlacement = measure.notes.every((note) => note.pitch === null || (
      typeof note.lyric === "string" && lyricSyllables(note.lyric).length <= 1
    ));
    const notes: NoteEvent[] = measure.notes.map((note) => {
      if (typeof note.id !== "string" || !note.id || ids.has(note.id)) throw new Error("Invalid note id");
      ids.add(note.id);
      if (!note.duration || !Number.isInteger(note.duration.numerator) || !Number.isInteger(note.duration.denominator) || note.duration.denominator <= 0) throw new Error("Invalid duration");
      const beats = toNumber(note.duration);
      const duration = PRACTICE_DURATIONS.find((item) => item.beats === beats);
      if (!duration || (note.pitch !== null && !isPracticePitch(note.pitch))) throw new Error("Invalid note");
      const accidental = ["sharp", "flat", "natural"].includes(note.accidental ?? "") ? note.accidental : undefined;
      return {
        id: note.id,
        pitch: note.pitch,
        duration: rational(note.duration.numerator, note.duration.denominator),
        dotted: duration.dotted,
        ...(note.pitch !== null && accidental ? { accidental } : {}),
        ...(note.pitch !== null && typeof note.lyric === "string" ? { lyric: lyricSyllables(note.lyric).join("") } : {})
      };
    });
    const remainingSyllables = lyricSyllables(lyric);
    const placementMatchesSource = notes.every((note) => {
      if (!note.lyric) return true;
      const sourceIndex = remainingSyllables.indexOf(note.lyric);
      if (sourceIndex < 0) return false;
      remainingSyllables.splice(sourceIndex, 1);
      return true;
    });
    return {
      id: `${idPrefix}-${index + 1}`,
      lyric,
      chord: typeof measure.chord === "string" ? measure.chord : "C",
      notes: hasSavedPlacement && placementMatchesSource ? notes : assignPracticeLyrics(notes, lyric)
    };
  });
  return normalizePracticeHarmony(restored);
}

function restoreLayers(saved: unknown, count: number, noteIds: Set<string>): PracticeRhythmLayer[] {
  if (!Array.isArray(saved)) return [];
  const layerIds = new Set(["primary"]);
  const layers: PracticeRhythmLayer[] = [];
  for (const layer of saved.slice(0, MAX_PRACTICE_SCORES - 1)) {
    try {
      if (!layer || typeof layer.id !== "string" || !layer.id || layer.id.length > 80 || layerIds.has(layer.id)) continue;
      const instrumentId = normalizePracticeRhythmInstrument(layer.instrumentId);
      if (!instrumentId || !Array.isArray(layer.measures) || layer.measures.length !== count) continue;
      // A broken optional score must not consume IDs or discard the first score.
      const candidateNoteIds = new Set(noteIds);
      const measures = restoreMeasures(layer.measures, candidateNoteIds, `${layer.id}-measure`);
      for (const id of candidateNoteIds) noteIds.add(id);
      layerIds.add(layer.id);
      layers.push({ id: layer.id, instrumentId, measures });
    } catch {
      // Keep other usable scores when one additional score is corrupted.
    }
  }
  return layers;
}

export function readPracticeDraft(): PracticeDraft {
  const fallback = emptyPracticeDraft();
  try {
    const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.measures) || saved.measures.length < 1 || saved.measures.length > 8) return fallback;
    const meter = SUPPORTED_METERS.find((item) => meterKey(item) === `${saved.meter?.beats}/${saved.meter?.beatUnit}`);
    if (!meter) return fallback;
    const ids = new Set<string>();
    const measures = restoreMeasures(saved.measures, ids, "practice-measure");
    return {
      ...fallback,
      title: typeof saved.title === "string" ? saved.title.slice(0, 80) : fallback.title,
      meter,
      measures,
      bpm: Number.isInteger(saved.bpm) && saved.bpm >= 50 && saved.bpm <= 180 ? saved.bpm : fallback.bpm,
      melodyInstrumentId: findInstrument(saved.melodyInstrumentId).id,
      rhythmInstrumentId: typeof saved.rhythmInstrumentId === "string" && saved.rhythmInstrumentId.startsWith("beat:") && isBeatInstrumentId(saved.rhythmInstrumentId.slice(5))
        ? saved.rhythmInstrumentId : findInstrument(saved.rhythmInstrumentId).id,
      rhythmLayers: restoreLayers(saved.rhythmLayers, measures.length, ids)
    };
  } catch {
    return fallback;
  }
}

export function writePracticeDraft(draft: PracticeDraft): boolean {
  try {
    localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
